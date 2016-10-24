'use strict';

var http = require('http');
var https = require('https');
var urlParse = require('url').parse;

//var urlApi = 'https://api.ethers.io/api/v1/';
var urlApi = 'http://localhost:5000/api/v1/';

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
                resolve(data.toString());
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

function putSlug(alias, signedSlug) {
    var payload = JSON.stringify({
        action: 'addSlug',
        slug: signedSlug
    });

    return new Promise(function(resolve, reject) {
        post(urlApi, payload).then(function(result) {
            // @TODO: parse result
            resolve(result);
        }, function(error) {
            reject(error);
        });
    });
}

function getSlugVersions(address) {
    var payload = JSON.stringify({
        action: 'getSlugVersions',
        address: address
    });

    return new Promise(function(resolve, reject) {
        post(urlApi, payload).then(function(result) {
            resolve(result);
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
    putSlug: putSlug
}
