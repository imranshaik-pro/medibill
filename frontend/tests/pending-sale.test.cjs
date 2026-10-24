const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = ts.transpileModule(fs.readFileSync('src/services/pendingSale.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
function harness(api, store = new Map(), blocked = false) {
  const exports = {}
  vm.runInNewContext(source, { exports, require: () => ({ apiClient: api }), crypto: { randomUUID: () => 'stable-key' }, localStorage: {
    getItem: k => store.get(k) ?? null,
    setItem: (k,v) => { if (blocked) throw Error('storage unavailable'); store.set(k,v) },
    removeItem: k => store.delete(k),
  } })
  return { ...exports, store }
}
test('lost response survives remount and replays identical key/payload', async () => {
  const calls = []; const store = new Map()
  const first = harness({ createSale: async (p,k) => { calls.push([p,k]); throw Error('lost response') } }, store)
  await assert.rejects(first.postSale('tenant:user', { invoice_number: 'I-1' }))
  const next = harness({ createSale: async (p,k) => { calls.push([p,k]); return { id: 42 } } }, store)
  assert.equal((await next.postSale('tenant:user')).id, 42)
  assert.equal(JSON.stringify(calls[0]), JSON.stringify(calls[1])); assert.equal(store.size, 0)
})
test('unresolved command blocks changed payload and is isolated by user/tenant', async () => {
  let calls=0
  const h=harness({ createSale: async () => { calls++; throw Error('timeout') } })
  await assert.rejects(h.postSale('A:1',{invoice_number:'I-1'}))
  await assert.rejects(h.postSale('A:1',{invoice_number:'I-2'}), /unresolved/)
  assert.equal(h.pendingSale('B:1'),null);assert.equal(h.pendingSale('A:2'),null);assert.equal(calls,1)
})
test('storage failure prevents sending an untracked mutation', async () => {
  let calls=0;const h=harness({createSale:async()=>{calls++}},new Map(),true)
  await assert.rejects(h.postSale('A:1',{invoice_number:'I-1'}),/storage unavailable/)
  assert.equal(calls,0)
})
test('server rejection releases invalid payload; 5xx preserves uncertain outcome', async () => {
  const rejected=harness({createSale:async()=>{throw {response:{status:422}}}})
  await assert.rejects(rejected.postSale('A:1',{invoice_number:'I-1'}));assert.equal(rejected.store.size,0)
  const uncertain=harness({createSale:async()=>{throw {response:{status:500}}}})
  await assert.rejects(uncertain.postSale('A:1',{invoice_number:'I-1'}));assert.equal(uncertain.store.size,1)
})
test('confirmed 409 releases the invoice so a corrected number can be posted', async () => {
  let calls=0
  const h=harness({createSale:async()=>{
    if (++calls===1) throw {response:{status:409,headers:{'x-command-outcome':'rejected'}}}
    return {id:43}
  }})
  await assert.rejects(h.postSale('A:1',{invoice_number:'duplicate'}))
  assert.equal(h.pendingSale('A:1'),null)
  assert.equal((await h.postSale('A:1',{invoice_number:'corrected'})).id,43)
})
test('unmarked 409 and idempotency mismatch keep original command for recovery', async () => {
  const h=harness({createSale:async()=>{throw {response:{status:409}}}})
  await assert.rejects(h.postSale('A:1',{invoice_number:'I-1'}))
  assert.notEqual(h.pendingSale('A:1'),null)
  await assert.rejects(h.postSale('A:1',{invoice_number:'I-2'}),/unresolved/)
})
