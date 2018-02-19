const Promise = require('bluebird');
const concatStream = require('concat-stream');
const needle = require('needle');
const mime = require('mime-types');
const urlParse = require('url').parse;
const fetch = require('node-fetch');
const querystring = require('querystring');
const debug = require('debug')('utils');

const Entities = require('html-entities').AllHtmlEntities;
const entities = new Entities();
const {bridge, puppet, SKYPE_USERS_TO_IGNORE} = require('../config.json');

const a2b = str => new Buffer(str).toString('base64');
const b2a = str => new Buffer(str, 'base64').toString('ascii');
const URL_BASE = `${bridge.homeserverUrl}/_matrix/client/r0`;

const setRoomAlias = (roomId, alias) => {
    const encodeAlias = encodeURIComponent(alias);
    const query = querystring.stringify({'access_token': puppet.token});
    const url = `${URL_BASE}/directory/room/${encodeAlias}?${query}`;
    const body = {'room_id': roomId};
    return fetch(url, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: {'Content-Type': 'application/json'},
    })
        .then(res => {
            debug('Request for setting alias name %s for room %s in matrix have status %s ', alias, roomId, res.status);
        });
};

const getDisplayName = sender => {
    const encodeSender = encodeURIComponent(sender);
    const url = `${URL_BASE}/profile/${encodeSender}/displayname`;
    return fetch(url)
        .then(res => res.json())
        .then(({displayname}) => {
            const result = displayname || sender;
            debug('Display name for user %s in skype is %s', sender, result);
            return result;
        });
};

const getRoomName = roomId => {
    const query = querystring.stringify({'access_token': puppet.token});
    const url = `${URL_BASE}/rooms/${roomId}/state/m.room.name?${query}`;
    return fetch(url)
        .then(res => res.json())
        .then(({name}) => {
            const result = name || 'Bingo-boom conversation';
            debug('Display name for roomId %s in skype is %s', roomId, result);
            return result;
        });
};

const getMatrixUsers = users =>
    users
        .filter(user => !SKYPE_USERS_TO_IGNORE.includes(user))
        .map(user =>
            `@${user.split(':').pop()}:${bridge.domain}`);

const downloadGetStream = (url, data) => needle.get(url, data);

const downloadGetBufferAndHeaders = (url, data) =>
    new Promise((resolve, reject) => {
        let headers = {
            'content-type': 'application/octet-stream',
        };
        const stream = downloadGetStream(url, data);
        stream.on('header', (_s, _h) => {
            headers = _h;
        });
        stream.pipe(concatStream(buffer => {
            resolve({buffer, headers});
        })).on('error', reject);
    });

const downloadGetBufferAndType = (url, data) =>
    downloadGetBufferAndHeaders(url, data)
        .then(({buffer, headers}) => {
            let type;
            const contentType = headers['content-type'];
            if (contentType) {
                type = contentType;
            } else {
                type = mime.lookup(urlParse(url).pathname);
            }
            [type] = type.split(';');
            return {buffer, type};
        });


const getIdFromMatrix = (user, prefix = '') => {
    const [result] = user.replace(`@${prefix}`, '').split(':');
    return result;
};

const getId = (user, func) => {
    const prefix = 'skype_';
    return user.includes(prefix) ? func(getIdFromMatrix(user, prefix)) : `8:live:${getIdFromMatrix(user)}`;
};

const getSkypeMatrixUsers = (skypeCollection, matrixRoomUsers) => {
    const usersIds = matrixRoomUsers.map(user => getId(user, b2a));
    return skypeCollection
        .map(({personId}) => personId)
        .filter(id => usersIds.includes(id));
};

module.exports = {
    a2b,
    b2a,
    getSkypeMatrixUsers,
    getIdFromMatrix,
    getId,
    getMatrixUsers,
    getDisplayName,
    getRoomName,
    setRoomAlias,
    download: {
        getStream: downloadGetStream,
        getBufferAndType: downloadGetBufferAndType,
    },
    entities,
};
