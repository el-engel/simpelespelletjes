import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signGameToken, verifyGameToken, TOKEN_TTL_MS } from '../../src/lib/server/token.ts';

const secret = 'x'.repeat(40);

test('geldig token wordt geaccepteerd', () => {
	const { token } = signGameToken('game-1', secret, 1000);
	assert.equal(verifyGameToken(token, secret, 2000)?.g, 'game-1');
});

test('verlopen, vervalst of fout ondertekend token wordt geweigerd', () => {
	const { token } = signGameToken('game-1', secret, 1000);
	assert.equal(verifyGameToken(token, secret, 1000 + TOKEN_TTL_MS + 1), null);
	assert.equal(verifyGameToken(token, 'y'.repeat(40), 2000), null);
	const [body, sig] = token.split('.');
	const forged = Buffer.from(JSON.stringify({ g: 'game-2', exp: 9e15 })).toString('base64url');
	assert.equal(verifyGameToken(`${forged}.${sig}`, secret, 2000), null);
	assert.equal(verifyGameToken(`${body}.`, secret, 2000), null);
	assert.equal(verifyGameToken('rommel', secret, 2000), null);
});

test('te kort geheim wordt geweigerd', () => {
	assert.throws(() => signGameToken('g', 'kort'));
});
