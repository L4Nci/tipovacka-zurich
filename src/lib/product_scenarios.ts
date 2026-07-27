import {
  buildInviteUrl,
  getInviteCodeFromLocation,
  normalizeInviteCode
} from './sharing.ts';

let passed = 0;
let failed = 0;

const check = (name: string, condition: boolean) => {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
};

check('normalizes invite codes', normalizeInviteCode(' ab-cd ') === 'AB-CD');
check(
  'reads path invite',
  getInviteCodeFromLocation('/join/ABCD1234', '') === 'ABCD1234'
);
check(
  'keeps query invite backward compatible',
  getInviteCodeFromLocation('/', '?join=abcd1234') === 'ABCD1234'
);
check(
  'builds domain-independent invite URL',
  buildInviteUrl('abcd1234', 'https://example.test/') === 'https://example.test/join/ABCD1234'
);
check(
  'does not invent an invite without a source',
  getInviteCodeFromLocation('/', '') === ''
);
check(
  'rejects malformed invite paths without crashing startup',
  getInviteCodeFromLocation('/join/%E0%A4%A', '') === ''
);

console.log(`\nProduct scenarios: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
