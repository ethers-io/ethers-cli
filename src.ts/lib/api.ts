'use strict';

import http from 'http';
import https from 'https';
import { parse as urlParse } from 'url';

var ethers = require('ethers');

var urlApi = 'https://api.ethers.io/api/v1/';
//var urlApi = 'http://localhost:5000/api/v1/';

// @TODO: Include a timestamp (or nonce of some sort) in uploads

function post(url: string, data: string): Promise<any> {
    var options: http.ClientRequestArgs = urlParse(url);
    options.method = 'POST';
    options.headers = {'content-length': String(data.length)};
    return new Promise(function(resolve, reject) {
        let requestFunc = http.request;
        if (options.protocol === 'https:') { requestFunc = https.request; }
        var request = requestFunc(options, function(response: http.IncomingMessage) {
            var data = new Buffer(0);

            response.on('data', function(chunk: Buffer) {
                data = Buffer.concat([data, chunk]);
            });

            response.on('end', function() {
                try {
                    var result = JSON.parse(data.toString());
                    if (result.status !== 200) {
                        reject(new Error('failed'));
                        return;
                    }
                    resolve(result);
                } catch (error) {
                    reject(new Error('invalid response'));
                }
            });

            response.on('error', function(error: Error) {
                reject(error);
            });
        });

        request.write(data);
        request.end();
    });
}

//function addContract(source) {
//}

//function addDeployment(hash, multihash, optimize, compilerVersion, deploymentTarget) {
//}

function publish(signedPubdata: string) {
    var payload = JSON.stringify({
        action: 'publish',
        pubdata: signedPubdata
    });

    return new Promise(function(resolve, reject) {
        post(urlApi, payload).then(function(result) {
            resolve(true);
        }, function(error) {
            reject(error);
        });
    });
}

function getPublished(address: string) {
    var payload = JSON.stringify({
        action: 'getPublished',
        address: ethers.utils.getAddress(address)
    });

    return new Promise(function(resolve, reject) {
        post(urlApi, payload).then(function(result) {
            resolve(result.published);
        }, function(error) {
            reject(error);
        });
    });
}

function putSlug(alias: string, signedSlug: string) {
    var payload = JSON.stringify({
        action: 'addSlug',
        slug: signedSlug
    });

    return new Promise(function(resolve, reject) {
        post(urlApi, payload).then(function(result) {
            resolve(JSON.parse(signedSlug).address.toLowerCase() + '.ethers.space');
        }, function(error) {
            reject(error);
        });
    });
}

function getSlugVersions(address: string) {
    var payload = JSON.stringify({
        action: 'getSlugVersions',
        address: ethers.utils.getAddress(address)
    });

    return new Promise(function(resolve, reject) {
        post(urlApi, payload).then(function(result) {
            resolve(result.versions);
        }, function(error) {
            reject(error);
        });
    });
}

module.exports = {
    //addContract: addContract,
    //addDeployment: addDeployment,
    //getSlug: getSlug,
    getSlugVersions: getSlugVersions,
    putSlug: putSlug,

    publish: publish,
    getPublished: getPublished,
}
