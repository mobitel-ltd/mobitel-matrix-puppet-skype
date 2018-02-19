/* eslint-disable no-console */
const {
    MatrixAppServiceBridge: {
        Cli,
        AppServiceRegistration,
    },
    Puppet,
} = require('matrix-puppet-bridge');
const path = require('path');

const config = require('./config.json');
const App = require('./src/app');

const puppet = new Puppet(path.join(__dirname, './config.json'));

new Cli({
    port: config.port,
    registrationPath: config.registrationPath,
    generateRegistration(reg, callback) {
        puppet.associate().then(() => {
            reg.setId(AppServiceRegistration.generateToken());
            reg.setHomeserverToken(AppServiceRegistration.generateToken());
            reg.setAppServiceToken(AppServiceRegistration.generateToken());
            reg.setSenderLocalpart('skypebot');
            reg.addRegexPattern('users', '@skype_.*', true);
            callback(reg);
        }).catch(err => {
            console.error(err.message);
            process.exit(-1);
        });
    },
    run(port) {
        const app = new App(config, puppet);
        console.log('starting matrix client');
        return puppet.startClient()
            .then(() => {
                console.log('starting skype client');
                return app.initThirdPartyClient();
            })
            .then(() =>
                app.bridge.run(port, config)
            )
            .then(() => {
                console.log('Matrix-side listening on port %s', port);
            })
            .catch(err => {
                console.error(err.message);
                process.exit(-1);
            });
    },
}).run();
