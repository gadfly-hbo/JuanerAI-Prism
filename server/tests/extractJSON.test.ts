// extractJSON 容错解析测试
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { extractJSON } = await import('../src/llm/index.ts');

test('标准 JSON 直接解析', () => {
  assert.deepEqual(extractJSON('{"a":1}'), { a: 1 });
});

test('```json 围栏与前后杂文本', () => {
  assert.deepEqual(extractJSON('好的，以下是结果：\n```json\n{"a":[1,2]}\n```\n希望有帮助'), { a: [1, 2] });
});

test('尾逗号与未引号 key', () => {
  assert.deepEqual(extractJSON('{"a": 1, "b": [2,]}'), { a: 1, b: [2] });
  assert.deepEqual(extractJSON('{a: 1, b: 2}'), { a: 1, b: 2 });
});

test('字符串内部的未转义引号（中文标题嵌套引用）', () => {
  const broken = '{"variants":[{"platform":"wechat","title":"从"执行红利"到决策红利：为什么","body":"正文"}]}';
  const r = extractJSON(broken);
  assert.equal(r.variants[0].platform, 'wechat');
  assert.equal(r.variants[0].title, '从"执行红利"到决策红利：为什么');
});

test('正常闭合的引号不被误伤（值后跟逗号/冒号）', () => {
  const r = extractJSON('{"m":"他说：\"你好\"","n":2}');
  assert.equal(r.m, '他说："你好"');
  assert.equal(r.n, 2);
});
