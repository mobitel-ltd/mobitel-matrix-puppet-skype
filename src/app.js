/* eslint-disable no-console */
const {MatrixPuppetBridgeBase} = require('matrix-puppet-bridge');
const SkypeClient = require('./client');
const config = process.env.NODE_ENV === 'test' ? require('../test/fixtures/config.json') : require('../config.json');
const debug = require('debug')('matrix-puppet:skype');
const {skypeify, deskypeify} = require('./skypeify');
const tmp = require('tmp');
const fs = require('fs');
const {a2b, b2a, setRoomAlias, getSkypeMatrixUsers, getMatrixUsers, getDisplayName, getRoomName, download, entities} = require('./utils');

module.exports = class App extends MatrixPuppetBridgeBase {
    getServicePrefix() {
        return 'skype';
    }
    getServiceName() {
        return 'Skype';
    }
    initThirdPartyClient() {
        this.client = new SkypeClient(config.skype);

        this.client.on('error', err => {
            this.sendStatusMsg({}, err);
        });

        this.client.on('message', data => {
            debug('message', data);
            const {
                type,
                from: {raw},
                conversation,
                content,
            } = data;
            const roomId = a2b(conversation);

            this.handleSkypeMessage({
                type,
                roomId,
                sender: raw,
                content,
            })
                .then(() =>
                    this.inviteSkypeConversationMembers(roomId, conversation))
                .catch(err =>
                    console.error('Error in skype message event', err));
        });
        this.client.on('sent', data => {
            debug('sent', data);

            const {type, conversation, content} = data;
            const roomId = a2b(conversation);

            this.handleSkypeMessage({
                type,
                roomId,
                sender: null,
                content,
            });
        });

        this.client.on('image', data => {
            const {
                type,
                from: {raw},
                conversation,
                uri,
                original_file_name: name,
            } = data;
            this.handleSkypeImage({
                type,
                roomId: a2b(conversation),
                sender: raw,
                url: `${uri}/views/imgpsh_fullsize`,
                name,
            });
        });

        return this.client.connect();
    }
    getJoinUrl(id) {
        return this.client.getJoinUrl(id)
            .catch(err => console.error(err));
    }
    inviteSkypeConversationMembers(roomId, conversation) {
        let matrixMembers;

        return this.client.getConversation(conversation)
            .then(skypeRoom => {
                const {members} = skypeRoom;
                matrixMembers = getMatrixUsers(members);
                return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId);
            })
            .then(matrixRoomId => {
                const roomMembers = this.puppet.getMatrixRoomMembers(matrixRoomId);
                const filteredUsers = matrixMembers.filter(user => !roomMembers.includes(user));
                if (filteredUsers.length === 0) {
                    debug('All members in skype conversation are already joined in Matrix room: ', matrixRoomId);
                } else {
                    return Promise.all(filteredUsers.map(user => this.puppet.client.invite(matrixRoomId, user)))
                        .then(() => debug('New users invited to room: ', roomId));
                }
            })
            .catch(err => console.error(err));
    }

    getThirdPartyUserDataByIdNoPromise(thirdPartySender) {
        const contact = this.client.getContact(thirdPartySender);
        const payload = {};
        if (contact) {
            payload.senderName = contact.displayName;
            payload.avatarUrl = contact.profile.avatarUrl;
        } else if (thirdPartySender.indexOf(':') > -1) {
            payload.senderName = thirdPartySender.substr(thirdPartySender.indexOf(':') + 1);
            payload.avatarUrl = `https://avatars.skype.com/v1/avatars/${entities.encode(payload.senderName)}/public?returnDefaultImage=false&cacheHeaders=true`;
        } else {
            payload.senderName = thirdPartySender;
        }
        return payload;
    }
    getPayload(data) {
        const payload = {
            roomId: data.roomId.replace(':', '^'),
        };
        if (data.sender) {
            payload.senderId = a2b(data.sender);
            Object.assign(payload, this.getThirdPartyUserDataByIdNoPromise(data.sender));
        } else {
            payload.senderId = null;
        }
        debug(payload);
        return payload;
    }
    handleMatrixEvent(req, _context) {
        const data = req.getData();
        if (data.type === 'm.room.message') {
            debug('incoming message. data:', data);
            return this.handleMatrixMessageEvent(data);
        } else if (data.type === 'm.room.member') {
            debug('incoming message. data:', data);
            return this.handleMatrixMemberEvent(data);
        }
        return debug('ignored a matrix event', data.type);
    }
    invitePuppetUserToSkypeConversation(invitedUser, matrixRoomId) {
        const skypeRoomId = b2a(this.getThirdPartyRoomIdFromMatrixRoomId(matrixRoomId));
        const [skypeUser] = getSkypeMatrixUsers(this.client.contacts, [invitedUser]);

        if (skypeUser) {
            return this.client.addMemberToConversation(skypeRoomId, skypeUser);
        }
    }
    handleMatrixMemberEvent(data) {
        const {room_id: matrixRoomId, membership, state_key: invitedUser} = data;
        const puppetClient = this.puppet.getClient();

        if (membership === 'invite' && invitedUser.includes('skype_') && invitedUser !== puppetClient.getUserId()) {
            const bot = this.bridge.getBot();
            const botClient = bot.getClient();
            const isJoined = puppetClient.getRooms()
                .find(({roomId}) => roomId === matrixRoomId);
            const invitedUserIntent = this.bridge.getIntent(invitedUser);

            if (isJoined) {
                return this.invitePuppetUserToSkypeConversation(invitedUser, matrixRoomId)
                    .catch(err =>
                        console.error(err));
            }
            const onRoomNameAndUserCollection = (usersCollection, roomName) => {
                const users = Object.keys(usersCollection);
                const skypeMatrixUsers = getSkypeMatrixUsers(this.client.contacts, users);
                const allUsers = {users: skypeMatrixUsers, admins: [this.client.getSkypeBotId()]};
                return this.client.createConversationWithTopic({topic: roomName, allUsers});
            };


            return invitedUserIntent.join(matrixRoomId)
                .then(() =>
                    invitedUserIntent.invite(matrixRoomId, puppetClient.getUserId()))
                .then(() =>
                    puppetClient.joinRoom(matrixRoomId))
                .then(() =>
                    invitedUserIntent.invite(matrixRoomId, bot.getUserId()))
                .then(() =>
                    botClient.joinRoom(matrixRoomId))
                .then(() =>
                    getRoomName(matrixRoomId))
                .then(roomName =>
                    bot.getJoinedMembers(matrixRoomId)
                        .then(usersCollection =>
                            onRoomNameAndUserCollection(usersCollection, roomName)))
                .then(skypeRoomId => {
                    console.log('Skype room %s is made', skypeRoomId);
                    const alias = this.getRoomAliasFromThirdPartyRoomId(a2b(skypeRoomId));
                    return setRoomAlias(matrixRoomId, alias);
                })
                .catch(err =>
                    console.error(err));
        }
        return debug('ignored a matrix event');
    }
    handleSkypeMessage(data) {
        const payload = this.getPayload(data);
        payload.text = deskypeify(data.content);
        return this.handleThirdPartyRoomMessage(payload);
    }
    handleSkypeImage(data) {
        const payload = this.getPayload(data);
        payload.text = data.name;
        payload.path = '';
        // needed to not create internal errors
        return this.client.downloadImage(data.url).then(({buffer, type}) => {
            payload.buffer = buffer;
            payload.mimetype = type;
            return this.handleThirdPartyRoomImageMessage(payload);
        }).catch(err => {
            console.error(err);
            payload.text = `[Image] (${data.name}) ${data.url}`;
            return this.handleThirdPartyRoomMessage(payload);
        });
    }
    getThirdPartyUserDataById(id) {
        const raw = b2a(id);
        return Promise.resolve(this.getThirdPartyUserDataByIdNoPromise(raw));
    }
    getThirdPartyRoomDataById(id) {
        const raw = b2a(id);
        const contact = this.client.getContact(raw);
        if (contact) {
            return Promise.resolve({
                name: deskypeify(contact.displayName),
                topic: 'Skype Direct Message',
            });
        }
        return new Promise((resolve, reject) => {
            this.client.getConversation(raw).then(res => {
                resolve({
                    name: deskypeify(res.threadProperties.topic),
                    topic: res.type.toLowerCase() === 'conversation' ? 'Skype Direct Message' : 'Skype Group Chat',
                });
            }).catch(err => {
                reject(err);
            });
        });
    }
    sendReadReceiptAsPuppetToThirdPartyRoomWithId() {
        // no-op for now
    }
    sendMessageAsPuppetToThirdPartyRoomWithId(id, text, {sender}) {
        return getDisplayName(sender)
            .then(displayName => `${displayName}:\n${text}`)
            .then(textWithSenderName =>
                this.client.sendMessage(b2a(id), {
                    textContent: skypeify(textWithSenderName),
                }));
    }
    sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data) {
        /* eslint-disable */
        let cleanup = () => {};
        return new Promise((resolve, reject) => {
            tmp.file((err, path, fd, cleanupCallback) => {
                cleanup = cleanupCallback;
                const tmpFile = fs.createWriteStream(path);
                // let handler;
                download.getBufferAndType(data.url).then(({buffer, type}) => {
                    tmpFile.write(buffer, err => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        tmpFile.close(() => {
                            resolve(this.client.sendPictureMessage(b2a(id), {
                                file: path,
                                name: data.text,
                                url: data.url,
                            }));
                        });
                    });
                });
            });
        }).finally(() => {
            cleanup();
        });
    }
}
