const {expect} = require('chai');
const {skypeify, deskypeify, replacer} = require('../src/skypeify.js');

describe('Skypeify module testing', () => {
    it('Test replacer', () => {
        const str = 'http://www.google.com';
        const expected = `<a href="${str}">${str}</a>`;
        const result = replacer(true, str);
        expect(result).be.equal(expected);
    });
    it('skypeify test', () => {
        const str1 = '&><"';
        const expected1 = `&amp;&gt;&lt;&quot;`;
        const result1 = skypeify(str1);
        expect(result1).be.equal(expected1);
    });
    it('deskypeify test', () => {
        const str = '';
        const expected = '';
        const result = deskypeify(str);
        expect(result).be.equal(expected);
    });
});
