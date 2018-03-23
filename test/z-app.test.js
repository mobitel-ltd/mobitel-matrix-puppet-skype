/* eslint {no-unused-expressions: 0, max-nested-callbacks: 0, global-require: 0} */
const lodash = require('lodash');
const sinonChai = require('sinon-chai');
const chai = require('chai');
const {stub} = require('sinon');
const Datastore = require('nedb');
const path = require('path');
const fs = require('fs');
const proxyquire = require('proxyquire');

const config = require('./fixtures/config.json');

const {Puppet} = require('matrix-puppet-bridge');
const utils = require('../src/utils.js');
const SkypeClient = require('../src/client.js');
const getDisplayNameStub = stub(utils, 'getDisplayName');
const setRoomAliasStub = stub(utils, 'setRoomAlias');
const getRoomNameStub = stub(utils, 'getRoomName');
const App = proxyquire('../src/app.js', {
    utils: {
        getDisplayName: getDisplayNameStub,
        setRoomAlias: setRoomAliasStub,
        getRoomName: getRoomNameStub,
    },
});

const TEST_USER_DB_PATH = path.resolve(__dirname, 'fixtures', 'test-users.db');
const TEST_ROOM_DB_PATH = path.resolve(__dirname, 'fixtures', 'test-rooms.db');
const BOT_LOCALPART = 'the_bridge';
const {expect} = chai;
chai.use(sinonChai);
// !!! Probably we can use classes as require from puppet-bridge and stub all their methods
const {
    MatrixAppServiceBridge: {
        UserBridgeStore,
        RoomBridgeStore,
    },
} = require('matrix-puppet-bridge');

const mkMockMatrixClient = uid => {
    const client = {
        'join': stub().resolves(),
        'rooms': [],
        'getRoom': stub().callsFake(() => ({
            getAliases: () => ['#skype_alias_name:matrix.domain.ru'],
        })),
        'register': stub(),
        'joinRoom': roomId =>
            new Promise((res, rej) => {
                client.rooms.push(roomId);
                res();
            }),
        'credentials': {
            userId: uid,
        },
        'invite': (roomId, userId) => new Promise((res, rej) => res()),
        'getRooms': () => client.rooms,
        'getUserId': () => client.credentials.userId,
        'createRoom': stub(),
        'setDisplayName': stub(),
        'setAvatarUrl': stub(),
        '_http': {
            authedRequestWithPrefix: ((none, method, urlPath, _none, data) => {
                if (method === 'POST' && urlPath === '/register') {
                    return client.register(data.user);
                }
                if (method === 'GET' && urlPath.includes('/joined_members')) {
                    return new Promise((res, rej) => res({
                        joined:
                        {
                            '@user:matrix.domain.ru': {
                                'avatar_url': 'mxc://matrix.domain.ru/abc',
                                'display_name': 'User Name',
                            },
                            '@skype_:matrix.domain.ru': {
                                'avatar_url': null,
                                'display_name': null,
                            },
                            '@skype_user:matrix.domain.ru': {
                                'avatar_url': 'mxc://matrix.domain.ru/abcd',
                                'display_name': 'Skype User',
                            },
                            '@skypebot:matrix.domain.ru': {
                                'avatar_url': null,
                                'display_name': null,
                            },
                        },
                    }));
                }
            }),
        },
    };
    return client;
};

describe('App testing', () => {
    const pathToConfig = path.resolve(__dirname, 'fixtures', 'config.json');
    let puppet;
    let appService;
    let spyOnEvent;
    let app;

    before(() => {
        puppet = new Puppet(pathToConfig);
        stub(puppet, 'startClient').callsFake(() => {
            const config = JSON.parse(fs.readFileSync(pathToConfig));
            puppet.id = config.puppet.id;
            puppet.client = mkMockMatrixClient(puppet.id);
        });
        stub(SkypeClient.prototype, 'connect').callsFake(() => ({}));
    });

    beforeEach(async () => {
        // Setup mock client factory to avoid making real outbound HTTP conns
        const clients = {};
        const clientFactory = {
            setLogFunction: stub(),
            configure: stub(),
            getClientAs: stub().callsFake((uid, req) =>
                clients[
                    (uid ? uid : 'bot') + (req ? req.getId() : '')
                ]),
        };
        // const mockFactory = mock(clientFactory);
        clients.bot = mkMockMatrixClient(
            `@${BOT_LOCALPART}:${config.domain}`
        );

        // Setup mock AppService to avoid listening on a real port
        appService = {
            onAliasQuery: stub(),
            on: (name, fn) => {
                if (!appService._events[name]) {
                    appService._events[name] = [];
                }
                appService._events[name].push(fn);
            },
            onUserQuery: stub(),
            listen: stub(),
        };
        appService._events = {};
        appService.emit = (name, obj) => {
            const list = appService._events[name] || [];
            const promises = list.map(fn =>
                fn(obj));
            return Promise.all(promises);
        };

        const loadDatabase = (path, Cls) =>
            new Promise((resolve, reject) => {
                const db = new Datastore({
                    filename: path,
                    autoload: true,
                    onload(err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(new Cls(db));
                    },
                });
            });
        const [userStore, roomStore] = await Promise.all([
            loadDatabase(TEST_USER_DB_PATH, UserBridgeStore),
            loadDatabase(TEST_ROOM_DB_PATH, RoomBridgeStore),
        ]);
        const bridge = {clientFactory, userStore, roomStore};
        lodash.merge(config, {bridge});
        app = new App(config, puppet);
        const {controller} = app.bridge.opts;
        controller.thirdPartyLookup = null;
        spyOnEvent = stub(controller, 'onEvent').callsFake(req => req.resolve(app.handleMatrixEvent(req)));
    });

    afterEach(() => {
        try {
            fs.unlinkSync(TEST_USER_DB_PATH);
        } catch (err) {
            // do nothing
        } try {
            fs.unlinkSync(TEST_ROOM_DB_PATH);
        } catch (err) {
            // do nothing
        }
        spyOnEvent.restore();
    });


    it('Test App', () => {
        expect(app).to.be.ok;
    });

    it('Test correct mock for Puppet', () => {
        puppet.startClient();
        // expect(stubSdkCreateClient).to.have.been.called;
        const client = puppet.getClient();
        expect(client).to.be.ok;
        const userId = client.getUserId();
        expect(userId).to.be.equal('@skype_:matrix.domain.ru');
    });

    it('Skype client should send message after getting message event from matrix', async () => {
        getDisplayNameStub.callsFake(sender => new Promise((res, rej) => res(`${sender}DisplayName`)));
        const skypeClientSendMessageStub = stub(SkypeClient.prototype, 'sendMessage').callsFake(() => ({}));

        const event = {
            'content': {
                body: 'oh noes!',
                msgtype: 'm.text',
            },
            'sender': '@test_user:bar',
            'user_id': '@virtual_foo:bar',
            'room_id': '!flibble:bar',
            'type': 'm.room.message',
        };
        await puppet.startClient();
        await app.initThirdPartyClient();
        await app.bridge.run(8090, puppet, appService);
        await appService.emit('event', event);
        expect(spyOnEvent).to.have.been.called;
        expect(getDisplayNameStub).to.have.been.called;
        const expectedId = utils.b2a('alias_name');
        expect(skypeClientSendMessageStub).to.have.been.calledWith(expectedId);
    });

    it('Should create chat in skype after getting invite event from matrix', async () => {
        const createConversationWithTopicStub = stub(SkypeClient.prototype, 'createConversationWithTopic')
            .callsFake(({topic}) => `${topic}skypeRoomId`);

        const event = {
            'content': {
                body: 'oh noes!',
                msgtype: 'm.text',
            },
            'membership': 'invite',
            'state_key': '@skype_ODpsaXZlOmd2X2dydWRpbmlu:bar',
            'sender': '@test_user:bar',
            'user_id': '@virtual_foo:bar',
            'room_id': '!flibble:bar',
            'type': 'm.room.member',
        };

        setRoomAliasStub.callsFake(sender => new Promise((res, rej) => res()));
        getRoomNameStub.resolves(event.room_id);
        await puppet.startClient();
        await app.initThirdPartyClient();
        stub(app.bridge, 'getIntent').callsFake(id => mkMockMatrixClient(id));
        stub(app.client, 'getSkypeBotId').callsFake(() => 'live:skypebot');

        await app.bridge.run(8090, puppet, appService);
        await appService.emit('event', event);

        expect(spyOnEvent).to.have.been.called;
        expect(createConversationWithTopicStub).to.have.been.called;

        const fakeSkypeRoom = `${event.room_id}skypeRoomId`;
        const expectedAlias = app.getRoomAliasFromThirdPartyRoomId(utils.a2b(fakeSkypeRoom));

        expect(setRoomAliasStub).to.have.been.calledWith(event.room_id, expectedAlias);
    });

    after(() => {
        getDisplayNameStub.restore();
    });
});
