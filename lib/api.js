'use strict';

var http = require('http');
var https = require('https');
var urlParse = require('url').parse;

var ethers = require('ethers');

var urlApi = 'https://api.ethers.io/api/v1/';
//var urlApi = 'http://localhost:5000/api/v1/';

// @TODO: Include a timestamp (or nonce of some sort) in uploads

function post(url, data) {
    var options = urlParse(url);
    options.method = 'POST';
    options.headers = {'content-length': String(data.length)};
    return new Promise(function(resolve, reject) {
        var request = ((options.protocol === 'https:') ? https: http).request(options, function(response) {
            var data = new Buffer(0);

            response.on('data', function(chunk) {
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

            response.on('error', function(error) {
                reject(error);
            });
        });

        request.write(data);
        request.end();
    });
}

function addContract(source) {
}

function addDeployment(hash, multihash, optimize, compilerVersion, deploymentTarget) {
}

function publish(signedPubdata) {
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

function getPublished(address) {
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

function putSlug(alias, signedSlug) {
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

function getSlugVersions(address) {
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
