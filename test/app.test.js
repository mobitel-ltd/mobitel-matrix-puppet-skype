/* eslint-disable*/
const {expect} = require('chai');
// const sinon = require('sinon');
// const {EventEmitter} = require('events');
const App = require('../src/app.js');

describe('App testing', () => {
    it('Test App', () => {
        expect(App).to.be.ok;
    });
});
