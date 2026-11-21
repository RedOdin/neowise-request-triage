import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { handleRequest } from "./app.mjs";

const server = createServer(handleRequest);
let url;

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}/api/triage`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function post(body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  return [res.status, await res.json()];
}

test("invalid input returns 400", async () => {
  for (const body of ["", "{", "null", "[]", "{}", '{"text":3}', '{"text":""}', '{"text":"   "}']) {
    assert.deepEqual(await post(body), [400, { status: "invalid_input" }], body);
  }
});

test("accepts each supported topic and returns a usable draft", async () => {
  for (const [text, topic] of [["Доставка", "delivery"], ["Цена", "pricing"], ["Вопрос", "other"]]) {
    const [status, result] = await post(JSON.stringify({ text }));
    assert.equal(status, 200);
    assert.equal(result.status, "ready");
    assert.equal(result.topic, topic);
    assert.ok(result.draft.trim());
  }
});

for (const marker of ["error", "bad-json", "bad-topic", "empty-draft", "timeout"]) {
  test(`model failure [${marker}] sends the request to manual review`, async () => {
    const start = performance.now();
    assert.deepEqual(await post(JSON.stringify({ text: `[${marker}]` })), [
      200, { status: "manual_review", topic: null, draft: null },
    ]);
    // The mock sleeps for 1200 ms. Allow scheduling overhead beyond the 300 ms budget.
    if (marker === "timeout") assert.ok(performance.now() - start < 1000);
  });
}
