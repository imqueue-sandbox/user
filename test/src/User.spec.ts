import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
/*!
 * ISC License
 *
 * Copyright (c) 2026, Imqueue Sandbox
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
import { describe, it } from 'node:test';
import { User } from '../../src/index.js';

const require = createRequire(import.meta.url);

describe('User', () => {
    it('should be a class of IMQService', () => {
        assert.equal(typeof User, 'function');
        assert.equal(typeof (User.prototype as any).describe, 'function');
    });

    describe('version()', () => {
        const service = new User();
        const pkg = require('../../package.json');

        it('should be a function', () => {
            assert.equal(typeof service.version, 'function');
        });

        it('should return proper name string', async () => {
            assert.equal((await service.version()).name, pkg.name);
        });

        it('should return proper version string', async () => {
            assert.equal((await service.version()).version, pkg.version);
        });
    });

    describe('exposed RPC interface', () => {
        const methods = [
            'update',
            'fetch',
            'find',
            'count',
            'carsCount',
            'addCar',
            'removeCar',
            'getCar',
        ];

        for (const method of methods) {
            it(`should expose ${method}()`, () => {
                assert.equal(
                    typeof (User.prototype as any)[method],
                    'function',
                );
            });
        }
    });
});
