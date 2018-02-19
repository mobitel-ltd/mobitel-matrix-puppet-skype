const skypeHttp = require('skype-http');
const debug = require('debug')('matrix-puppet:skype:client');
const {skype} = require('../config.json');
// look at
// https://github.com/ocilo/skype-http/blob/master/src/example/main.ts
const EventEmitter = require('events');

const {download, entities} = require('./utils');

class Client extends EventEmitter {
    constructor(auth) {
        super();
        this.api = null;
        this.auth = auth;
        this.lastMsgId = null;
        this.selfSentFiles = [];
    }

    removeSelfSentFile(sentFile) {
        let match = false;
        while (match) {
            const index = this.selfSentFiles.indexOf(sentFile);
            if (index === -1) {
                return match;
            }
            match = true;
            this.selfSentFiles.splice(index, 1);
        }
    }

    connect() {
        const opts = {
            credentials: this.auth,
            verbose: true,
        };

        return skypeHttp.connect(opts)
            .then(api => {
                this.api = api;

                api.on('event', event => {
                    if (event && event.resource) {
                        switch (event.resource.type) {
                            case 'Text':
                            case 'RichText':
                                if (event.resource.from.username === api.context.username) {
                                    // the lib currently hides this kind from us. but i want it.
                                    if (event.resource.content.slice(-1) !== '\ufeff') {
                                        this.emit('sent', event.resource);
                                    }
                                } else {
                                    this.emit('message', event.resource);
                                }
                                break;
                            case 'RichText/UriObject':
                                if (!this.removeSelfSentFile(event.resource.original_file_name)) {
                                    if (event.resource.from.username === api.context.username) {
                                        event.resource.from.raw = null;
                                    }
                                    this.emit('image', event.resource);
                                }
                                break;
                        }
                    }
                });

                // Log every error
                api.on('error', err => {
                    console.error('An error was detected:');
                    console.error(err);
                    this.emit('error', err);
                });

                return api.getContacts().then(contacts => {
                    this.contacts = contacts;
                    debug(`got ${contacts.length} contacts`);

                    debug('listening for events');
                    return api.listen();
                });
            })
            .then(() => {
                debug('setting status online');
                return this.api.setStatus('Online');
            })
            .catch(err => {
                debug(err);
                process.exit(0);
            });
    }

    sendMessage(threadId, msg) {
        return this.api.sendMessage(msg, threadId);
    }

    sendPictureMessage(threadId, data) {
        this.selfSentFiles.push(data.name);
        return this.api.sendImage({
            file: data.file,
            name: data.name,
        }, threadId).catch(() => {
            this.removeSelfSentFile(data.name);
            this.api.sendMessage({
                textContent: `[Image] <a href="${entities.encode(data.url)}">${entities.encode(data.name)}</a>`,
            }, threadId);
        });
    }

    getJoinUrl(id) {
        return this.api.getJoinUrl(id);
    }

    getContact(id) {
        const contact = this.contacts.find(contact =>
            (contact.personId === id || contact.mri === id));
        return contact;
    }

    getConversation(id) {
        return this.api.getConversation(id);
    }

    downloadImage(url) {
        return download.getBufferAndType(url, {
            cookies: this.api.context.cookies,
            headers: {
                Authorization: `skype_token ${this.api.context.skypeToken.value}`,
            },
        });
    }

    // Using next client Api

    createConversationWithTopic({topic, allUsers}) {
        return this.api.createConversation(allUsers)
            .then(id =>
                this.api.setConversationTopic(id, topic)
                    .then(() => id));
    }


    addMemberToConversation(converstionId, memberId) {
        return this.api.addMemberToConversation(converstionId, memberId);
    }

    getSkypeBotId() {
        return `8:${this.api.context.username}`;
    }
}

module.exports = Client;

if (!module.parent) {
    const client = new Client(skype);
    client.connect().then(() => {
        client.on('message', ev => {
            debug('>>> message', ev);
        });

        client.on('sent', ev => {
            debug('>>> sent', ev);
        });

        client.sendMessage('8:green.streak', {textContent: 'test from nodejs'});
    });
}
