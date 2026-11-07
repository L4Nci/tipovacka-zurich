import test from 'node:test';
import assert from 'node:assert/strict';
import { safeMmaPortrait, fighterInitials } from './mmaPortraits.ts';

const portrait = () => ({ url: 'https://d33t2v9cbr12gb.cloudfront.net/commons/' + 'a'.repeat(64) + '.webp',
  width: 520, height: 679, artist: 'Show Jana Krause', license: 'CC BY 3.0',
  license_url: 'https://creativecommons.org/licenses/by/3.0', source_page: 'https://commons.wikimedia.org/wiki/File:JiriProchazka2022.png' });

test('only attributed, commercially reusable Commons images become portraits', () => {
  assert.deepEqual(safeMmaPortrait(portrait()), portrait());
  assert.equal(safeMmaPortrait({ ...portrait(), license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0/' })?.license, 'CC BY-SA 4.0');
  assert.equal(safeMmaPortrait({ ...portrait(), license: 'CC0', license_url: 'http://creativecommons.org/publicdomain/zero/1.0/deed.en' })?.license_url, 'https://creativecommons.org/publicdomain/zero/1.0/deed.en');
  assert.equal(safeMmaPortrait({ ...portrait(), license: 'Public domain', license_url: null })?.license, 'Public domain');
  for (const change of [{ artist: null }, { artist: '<img src=x>' }, { license: 'CC BY-NC 3.0' }, { license: 'CC BY-ND 3.0' },
    { license: 'CC BY 4.0' }, { license_url: null }, { width: -1 }, { height: Infinity }, { source_page: 'https://example.com' }]) {
    assert.equal(safeMmaPortrait({ ...portrait(), ...change }), null, JSON.stringify(change));
  }
});

test('asset and credit URLs cannot become scripts, API calls or lookalike destinations', () => {
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,x', 'https://api.ufcalendar.com/v1/fighters/196',
    portrait().url + '?token=private', portrait().url.replace('cloudfront.net', 'cloudfront.net.example.com')]) {
    assert.equal(safeMmaPortrait({ ...portrait(), url }), null);
  }
  for (const license_url of ['https://creativecommons.org@evil.example/licenses/by/3.0',
    'https://user:password@creativecommons.org/licenses/by/3.0', 'https://creativecommons.org/licenses/by/3.0?token=x']) {
    assert.equal(safeMmaPortrait({ ...portrait(), license_url }), null);
  }
});

test('missing images and Unicode names have stable initial fallbacks', () => {
  assert.equal(safeMmaPortrait(undefined), null);
  assert.equal(safeMmaPortrait(null), null);
  assert.equal(fighterInitials('Jiří Procházka'), 'JP');
  assert.equal(fighterInitials('  Navajo   Stirling '), 'NS');
  assert.equal(fighterInitials(null), '?');
});
