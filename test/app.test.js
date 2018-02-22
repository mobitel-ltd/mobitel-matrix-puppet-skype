/* eslint {no-unused-expressions: 0, max-nested-callbacks: 0, global-require: 0} */
const lodash = require('lodash');
const sinonChai = require('sinon-chai');
const chai = require('chai');
const {stub} = require('sinon');
const Datastore = require('nedb');
const path = require('path');
const fs = require('fs');
const {Puppet} = require('matrix-puppet-bridge');
const proxyquire = require('proxyquire');

const config = require('./fixtures/config.json');
const utils = require('../src/utils.js');
const SkypeClient = require('../src/client.js');
// const App = require('../src/app.js');
const getDisplayNameStub = stub(utils, 'getDisplayName');
const App = proxyquire('../src/app.js', {
    'utils': {getDisplayName: getDisplayNameStub},
    // SkypeClient: {'prototype.connect': () => ({})},
});
const debug = require('debug')('test');

const TEST_USER_DB_PATH = path.resolve(__dirname, 'fixtures', 'test-users.db');
const TEST_ROOM_DB_PATH = path.resolve(__dirname, 'fixtures', 'test-rooms.db');

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
        'getRoom': stub().callsFake(() => ({
            getAliases: () => ['#skype_alias_name:matrix.domain.ru'],
        })),
        'register': stub(),
        'joinRoom': stub(),
        'credentials': {
            userId: uid,
        },
        'createRoom': stub(),
        'setDisplayName': stub(),
        'setAvatarUrl': stub(),
        '_http': {
            authedRequestWithPrefix: (none, method, path, _none, data) => {
                if (method === 'POST' && path === '/register') {
                    return client.register(data.user);
                }
            },
        },
    };

    return client;
};

describe('App testing', () => {
    const puppet = new Puppet(path.resolve(__dirname, 'fixtures', 'config.json'));
    stub(puppet, 'startClient').callsFake(() => {
        puppet.client = mkMockMatrixClient();
    });
    let appService;
    const app = new App(config, puppet);
    const {id: puppetId} = config.puppet;

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

        clients.bot = mkMockMatrixClient(puppetId);

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
    });


    it('Test App', () => {
        expect(app).to.be.ok;
    });

    it('Test getting event to port 8090 from matrix', async () => {
        let result;
        // stub(App.prototype, 'handleMatrixEvent').callsFake({
        //     result = req.data;
        //     return req.resolve();
        // });
        const {controller} = app.bridge.opts;
        controller.thirdPartyLookup = null;

        debug('app %O', app);
        const spyMember = stub(app, 'handleMatrixMemberEvent').callsFake(data => {
            result = data;
        });
        getDisplayNameStub.callsFake(sender => new Promise((res, rej) => res(`${sender}DisplayName`)));
        stub(SkypeClient.prototype, 'connect').callsFake(() => ({}));

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
        const spyOnEvent = stub(controller, 'onEvent').callsFake(req => {
            result = req.data;
            return req.resolve(app.handleMatrixEvent(req));
        });
        await puppet.startClient();
        await app.initThirdPartyClient();
        await app.bridge.run(8090, puppet, appService);
        await appService.emit('event', event);
        expect(spyOnEvent).to.have.been.called;
        expect(spyMember).to.have.been.called;
        // expect(app.handleMatrixMemberEvent).to.have.been.called;
        expect(result).to.deep.equal(event);
    });
});
