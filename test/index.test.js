const nock = require('nock');
const {expect} = require('chai');
const {b2a, a2b, getSkypeMatrixUsers, getRoomName, getIdFromMatrix, getId, getMatrixUsers, getDisplayName} = require('../src/utils');
const {puppet, bridge} = require('../config.json');

describe('Utils test', () => {
    const sender = '@senderName:mvs';
    const expectedData = 'correct';
    const roomId = '!npBatwRCSuXWushCFs:matrix.bingo-boom.ru';

    // eslint-disable-next-line
    before(() => {
        nock('https://matrix.bingo-boom.ru')
            .get(`/_matrix/client/r0/profile/${encodeURIComponent(sender)}/displayname`)
            .reply(200, {displayname: expectedData})
            .get(`/_matrix/client/r0/rooms/${roomId}/state/m.room.name`)
            .query({'access_token': puppet.token})
            .reply(200, {name: expectedData});
    });

    it('Test getId', () => {
        const skypeUser1 = `@skype_${a2b('8:live:abcd')}:matrix:bingo-boom.ru`;
        const skypeUser2 = `@skype_${a2b('8:live:abcd_dcba')}:matrix:bingo-boom.ru`;
        const users = [skypeUser1, '@gv_grudinin:matrix:bingo-boom.ru', skypeUser2];

        // eslint-disable-next-line
        const result = users.map(user => getId(user, b2a));
        const expected = ['8:live:abcd', '8:live:gv_grudinin', '8:live:abcd_dcba'];
        expect(result).to.deep.equal(expected);
    });

    it('Test getIdFromMatrix', () => {
        const user = '@skype_ODpsaXZlOnNreXBlYm90dGVzdF8y:matrix.bingo-boom.ru';
        const expected = 'ODpsaXZlOnNreXBlYm90dGVzdF8y';
        const result = getIdFromMatrix(user, 'skype_');
        expect(result).to.equal(expected);
    });

    it('Test getMatrixUsers', () => {
        const users = [
            'a:b:c',
            'a:b',
            'a',
            '8:live:skypebottest_2',
            '8:live:skypebot_26',
        ];
        const expected = [
            `@c:${bridge.domain}`,
            `@b:${bridge.domain}`,
            `@a:${bridge.domain}`,
        ];

        const result = getMatrixUsers(users);
        expect(result).deep.equal(expected);
    });

    it('Room should be created', async () => {
        const result = await getDisplayName(sender);
        expect(result).to.equal(expectedData);
    });

    it('Get room name', async () => {
        const result = await getRoomName(roomId);
        expect(result).to.equal(expectedData);
    });

    it('Test getSkypeMatrixUsers', () => {
        const clientCollection = [
            {personId: '8:live:skypebottest_2'},
            {personId: '8:live:abcdefg'},
            {personId: '8:live:hijk'},
        ];
        const users = [
            `@skype_${a2b('8:live:skypebottest_2')}:${bridge.domain}`,
            `@skype_${a2b('8:live:abcdefg')}:${bridge.domain}`,
            `@skype_${a2b('8:live:hijk')}:${bridge.domain}`,
        ];
        const result = getSkypeMatrixUsers(clientCollection, users);
        const expected = [
            '8:live:skypebottest_2',
            '8:live:abcdefg',
            '8:live:hijk',
        ];
        expect(result).to.deep.equal(expected);
    });
});
