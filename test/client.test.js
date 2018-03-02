/* eslint-disable*/
// const nock = require('nock');
const {expect} = require('chai');
const sinon = require('sinon');
const {EventEmitter} = require('events');
const skypeHttp = require('skype-http');
const proxyquire = require('proxyquire');

class Api extends EventEmitter {
    constructor() {
        super();
        this.status = null;
    }
    async getContacts() {
        return ['contact1'];
    }
    async setStatus(status) {
        this.status = status;
    }
    async listen() {
        console.log('listen');
    }
}
const connect = async () =>  {
    return new Api;
}
const SkypeClient = proxyquire('../src/client', {'skype-http': {connect}});

describe('Client testing', () => {
    const skypeData = {
        username: "SKYPE_USERNAME",
        password: "SKYPE_PASSWORD",
    };

    it('Test client', async () => {
        const client = new SkypeClient(skypeData);
        await client.connect({credentials: skypeData, verbose: true});

        expect(client.api).to.be.ok;
    });
});
