'use strict';

var compiler = require('./compiler');

var ethers = require('ethers');
var TestRPC = require('ethereumjs-testrpc');

var Account = require('ethereumjs-account');
var Block = require('ethereumjs-block');
var BN = require('ethereumjs-util').BN;
var createVm = require('ethereumjs-vm/dist/hooked').fromWeb3Provider
var FakeTransaction = require('ethereumjs-tx/fake.js')

var DebugPrinter = require('./debug-printer');

process.on('unhandledRejection', function(reason, p){
    if (reason && reason.runtimeSolidityError) {
        var rse = reason.runtimeSolidityError;
        console.log('Error: Runtime Solidity Error');
        console.log('    filename=' + rse.filename + ', line=' + rse.line + ', function=' + rse.method);
    } else {
        console.log('Error: Unhandled promise rejection');
        console.log(reason);
    }
});


function addHexPrefix(str) {
    if (typeof str !== 'string' || (str.length >= 2 && str.substring(0, 2) == '0x')) {
        return str
    }
    return '0x' + str;
}

function blockFromBlockData(blockData){
  var block = new Block()
  // block.header.hash = ethUtil.addHexPrefix(blockData.hash.toString('hex'))

  block.header.parentHash = blockData.parentHash
  block.header.uncleHash = blockData.sha3Uncles
  block.header.coinbase = blockData.miner
  block.header.stateRoot = blockData.stateRoot
  block.header.transactionTrie = blockData.transactionsRoot
  block.header.receiptTrie = blockData.receiptRoot || blockData.receiptsRoot
  block.header.bloom = blockData.logsBloom
  block.header.difficulty = blockData.difficulty
  block.header.number = blockData.number
  block.header.gasLimit = blockData.gasLimit
  block.header.gasUsed = blockData.gasUsed
  block.header.timestamp = blockData.timestamp
  block.header.extraData = blockData.extraData
  return block
}

var codes = {

    // https://etherscan.io/tx/0x40ea7c00f622a7c6699a0013a26e2399d0cd167f8565062a43eb962c6750f7db
    ENS: compiler.makeCode(
        'ENS',
        '0x3360206000015561021a806100146000396000f3630178b8bf60e060020a600035041415610020576004355460405260206040f35b6302571be360e060020a600035041415610044576020600435015460405260206040f35b6316a25cbd60e060020a600035041415610068576040600435015460405260206040f35b635b0fc9c360e060020a6000350414156100b557602060043501543314151561008f576002565b6024356020600435015560243560405260043560198061020160003960002060206040a2005b6306ab592360e060020a6000350414156101135760206004350154331415156100dc576002565b6044356020600435600052602435602052604060002001556044356040526024356004356021806101e060003960002060206040a3005b631896f70a60e060020a60003504141561015d57602060043501543314151561013a576002565b60243560043555602435604052600435601c806101c460003960002060206040a2005b6314ab903860e060020a6000350414156101aa576020600435015433141515610184576002565b602435604060043501556024356040526004356016806101ae60003960002060206040a2005b6002564e657754544c28627974657333322c75696e743634294e65775265736f6c76657228627974657333322c61646472657373294e65774f776e657228627974657333322c627974657333322c61646472657373295472616e7366657228627974657333322c6164647265737329',
        [
            {"constant":true,"inputs":[{"name":"node","type":"bytes32"}],"name":"resolver","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},
            {"constant":true,"inputs":[{"name":"node","type":"bytes32"}],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"label","type":"bytes32"},{"name":"owner","type":"address"}],"name":"setSubnodeOwner","outputs":[],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"ttl","type":"uint64"}],"name":"setTTL","outputs":[],"payable":false,"type":"function"},
            {"constant":true,"inputs":[{"name":"node","type":"bytes32"}],"name":"ttl","outputs":[{"name":"","type":"uint64"}],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"resolver","type":"address"}],"name":"setResolver","outputs":[],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"owner","type":"address"}],"name":"setOwner","outputs":[],"payable":false,"type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":false,"name":"owner","type":"address"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":true,"name":"label","type":"bytes32"},{"indexed":false,"name":"owner","type":"address"}],"name":"NewOwner","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":false,"name":"resolver","type":"address"}],"name":"NewResolver","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":false,"name":"ttl","type":"uint64"}],"name":"NewTTL","type":"event"}
        ]
    ),

    // https://etherscan.io/address/0x5ffc014343cd971b7eb70732021e26c35b744cc4#code
    PublicResolver: compiler.makeCode(
        'PublicResolver',
        '0x6060604052341561000c57fe5b60405160208061129f83398101604052515b60008054600160a060020a031916600160a060020a0383161790555b505b6112548061004b6000396000f300606060405236156100c25763ffffffff7c010000000000000000000000000000000000000000000000000000000060003504166301ffc9a781146100c457806310f13a8c146100f55780632203ab561461018b57806329cd62ea1461022d5780632dff6941146102485780633b3b57de1461026d57806359d1d43c1461029c578063623195b014610373578063691f3431146103cf5780637737221314610462578063c3d014d6146104bb578063c8690233146104d3578063d5fa2b00146104ff575bfe5b34156100cc57fe5b6100e1600160e060020a031960043516610520565b604080519115158252519081900360200190f35b34156100fd57fe5b60408051602060046024803582810135601f8101859004850286018501909652858552610189958335959394604494939290920191819084018382808284375050604080516020601f89358b0180359182018390048302840183019094528083529799988101979196509182019450925082915084018382808284375094965061068f95505050505050565b005b341561019357fe5b6101a16004356024356108a1565b60405180838152602001806020018281038252838181518152602001915080519060200190808383600083146101f2575b8051825260208311156101f257601f1990920191602091820191016101d2565b505050905090810190601f16801561021e5780820380516001836020036101000a031916815260200191505b50935050505060405180910390f35b341561023557fe5b6101896004356024356044356109b8565b005b341561025057fe5b61025b600435610aaf565b60408051918252519081900360200190f35b341561027557fe5b610280600435610ac8565b60408051600160a060020a039092168252519081900360200190f35b34156102a457fe5b60408051602060046024803582810135601f81018590048502860185019096528585526102f39583359593946044949392909201918190840183828082843750949650610ae695505050505050565b604080516020808252835181830152835191928392908301918501908083838215610339575b80518252602083111561033957601f199092019160209182019101610319565b505050905090810190601f1680156103655780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b341561037b57fe5b604080516020600460443581810135601f8101849004840285018401909552848452610189948235946024803595606494929391909201918190840183828082843750949650610bf795505050505050565b005b34156103d757fe5b6102f3600435610cf0565b604080516020808252835181830152835191928392908301918501908083838215610339575b80518252602083111561033957601f199092019160209182019101610319565b505050905090810190601f1680156103655780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b341561046a57fe5b60408051602060046024803582810135601f81018590048502860185019096528585526101899583359593946044949392909201918190840183828082843750949650610d9b95505050505050565b005b34156104c357fe5b610189600435602435610ef3565b005b34156104db57fe5b6104e6600435610fcb565b6040805192835260208301919091528051918290030190f35b341561050757fe5b610189600435600160a060020a0360243516610fea565b005b6000600160e060020a031982167f3b3b57de0000000000000000000000000000000000000000000000000000000014806105835750600160e060020a031982167fd8389dc500000000000000000000000000000000000000000000000000000000145b806105b75750600160e060020a031982167f691f343100000000000000000000000000000000000000000000000000000000145b806105eb5750600160e060020a031982167f2203ab5600000000000000000000000000000000000000000000000000000000145b8061061f5750600160e060020a031982167fc869023300000000000000000000000000000000000000000000000000000000145b806106535750600160e060020a031982167f59d1d43c00000000000000000000000000000000000000000000000000000000145b806106875750600160e060020a031982167f01ffc9a700000000000000000000000000000000000000000000000000000000145b90505b919050565b60008054604080516020908101849052815160e060020a6302571be30281526004810188905291518794600160a060020a033381169516936302571be393602480830194919391928390030190829087803b15156106e957fe5b6102c65a03f115156106f757fe5b505060405151600160a060020a03169190911490506107165760006000fd5b6000848152600160209081526040918290209151855185936005019287929182918401908083835b6020831061075d5780518252601f19909201916020918201910161073e565b51815160209384036101000a6000190180199092169116179052920194855250604051938490038101909320845161079e95919491909101925090506110e5565b50826040518082805190602001908083835b602083106107cf5780518252601f1990920191602091820191016107b0565b51815160209384036101000a60001901801990921691161790526040805192909401829003822081835289518383015289519096508a95507fd8c9334b1a9c2f9da342a0a2b32629c1a229b6445dad78947f674b44444a7550948a9450839290830191908501908083838215610860575b80518252602083111561086057601f199092019160209182019101610840565b505050905090810190601f16801561088c5780820380516001836020036101000a031916815260200191505b509250505060405180910390a35b5b50505050565b60006108ab611164565b60008481526001602081905260409091209092505b8383116109ab57828416158015906108f95750600083815260068201602052604081205460026000196101006001841615020190911604115b1561099f57600083815260068201602090815260409182902080548351601f6002600019610100600186161502019093169290920491820184900484028101840190945280845290918301828280156109935780601f1061096857610100808354040283529160200191610993565b820191906000526020600020905b81548152906001019060200180831161097657829003601f168201915b505050505091506109b0565b5b6002909202916108c0565b600092505b509250929050565b60008054604080516020908101849052815160e060020a6302571be30281526004810188905291518794600160a060020a033381169516936302571be393602480830194919391928390030190829087803b1515610a1257fe5b6102c65a03f11515610a2057fe5b505060405151600160a060020a0316919091149050610a3f5760006000fd5b604080518082018252848152602080820185815260008881526001835284902092516003840155516004909201919091558151858152908101849052815186927f1d6f5e03d3f63eb58751986629a5439baee5079ff04f345becb66e23eb154e46928290030190a25b5b50505050565b600081815260016020819052604090912001545b919050565b600081815260016020526040902054600160a060020a03165b919050565b610aee611164565b6000838152600160209081526040918290209151845160059093019285928291908401908083835b60208310610b355780518252601f199092019160209182019101610b16565b518151600019602094850361010090810a820192831692199390931691909117909252949092019687526040805197889003820188208054601f6002600183161590980290950116959095049283018290048202880182019052818752929450925050830182828015610be95780601f10610bbe57610100808354040283529160200191610be9565b820191906000526020600020905b815481529060010190602001808311610bcc57829003601f168201915b505050505090505b92915050565b60008054604080516020908101849052815160e060020a6302571be30281526004810188905291518794600160a060020a033381169516936302571be393602480830194919391928390030190829087803b1515610c5157fe5b6102c65a03f11515610c5f57fe5b505060405151600160a060020a0316919091149050610c7e5760006000fd5b6000198301831615610c905760006000fd5b600084815260016020908152604080832086845260060182529091208351610cba928501906110e5565b50604051839085907faa121bbeef5f32f5961a2a28966e769023910fc9479059ee3495d4c1a696efe390600090a35b5b50505050565b610cf8611164565b6000828152600160208181526040928390206002908101805485516000199582161561010002959095011691909104601f8101839004830284018301909452838352919290830182828015610d8e5780601f10610d6357610100808354040283529160200191610d8e565b820191906000526020600020905b815481529060010190602001808311610d7157829003601f168201915b505050505090505b919050565b60008054604080516020908101849052815160e060020a6302571be30281526004810187905291518694600160a060020a033381169516936302571be393602480830194919391928390030190829087803b1515610df557fe5b6102c65a03f11515610e0357fe5b505060405151600160a060020a0316919091149050610e225760006000fd5b60008381526001602090815260409091208351610e47926002909201918501906110e5565b50604080516020808252845181830152845186937fb7d29e911041e8d9b843369e890bcb72c9388692ba48b65ac54e7214c4c348f7938793909283928301918501908083838215610eb3575b805182526020831115610eb357601f199092019160209182019101610e93565b505050905090810190601f168015610edf5780820380516001836020036101000a031916815260200191505b509250505060405180910390a25b5b505050565b60008054604080516020908101849052815160e060020a6302571be30281526004810187905291518694600160a060020a033381169516936302571be393602480830194919391928390030190829087803b1515610f4d57fe5b6102c65a03f11515610f5b57fe5b505060405151600160a060020a0316919091149050610f7a5760006000fd5b6000838152600160208181526040928390209091018490558151848152915185927f0424b6fe0d9c3bdbece0e7879dc241bb0c22e900be8b6c168b4ee08bd9bf83bc92908290030190a25b5b505050565b600081815260016020526040902060038101546004909101545b915091565b60008054604080516020908101849052815160e060020a6302571be30281526004810187905291518694600160a060020a033381169516936302571be393602480830194919391928390030190829087803b151561104457fe5b6102c65a03f1151561105257fe5b505060405151600160a060020a03169190911490506110715760006000fd5b600083815260016020908152604091829020805473ffffffffffffffffffffffffffffffffffffffff1916600160a060020a0386169081179091558251908152915185927f52d7d861f09ab3d26239d492e8968629f95e9e318cf0b73bfddc441522a15fd292908290030190a25b5b505050565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061112657805160ff1916838001178555611153565b82800160010185558215611153579182015b82811115611153578251825591602001919060010190611138565b5b50611160929150611207565b5090565b60408051602081019091526000815290565b60408051602081019091526000815290565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061112657805160ff1916838001178555611153565b82800160010185558215611153579182015b82811115611153578251825591602001919060010190611138565b5b50611160929150611207565b5090565b61122591905b80821115611160576000815560010161120d565b5090565b905600a165627a7a72305820590d0faea376673a253556e57e68413f45e8b0d2415a113e121408d9193455450029',
        [
            {"constant":true,"inputs":[{"name":"interfaceID","type":"bytes4"}],"name":"supportsInterface","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"key","type":"string"},{"name":"value","type":"string"}],"name":"setText","outputs":[],"payable":false,"type":"function"},
            {"constant":true,"inputs":[{"name":"node","type":"bytes32"},{"name":"contentTypes","type":"uint256"}],"name":"ABI","outputs":[{"name":"contentType","type":"uint256"},{"name":"data","type":"bytes"}],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"x","type":"bytes32"},{"name":"y","type":"bytes32"}],"name":"setPubkey","outputs":[],"payable":false,"type":"function"},
            {"constant":true,"inputs":[{"name":"node","type":"bytes32"}],"name":"content","outputs":[{"name":"ret","type":"bytes32"}],"payable":false,"type":"function"},
            {"constant":true,"inputs":[{"name":"node","type":"bytes32"}],"name":"addr","outputs":[{"name":"ret","type":"address"}],"payable":false,"type":"function"},
            {"constant":true,"inputs":[{"name":"node","type":"bytes32"},{"name":"key","type":"string"}],"name":"text","outputs":[{"name":"ret","type":"string"}],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"contentType","type":"uint256"},{"name":"data","type":"bytes"}],"name":"setABI","outputs":[],"payable":false,"type":"function"},
            {"constant":true,"inputs":[{"name":"node","type":"bytes32"}],"name":"name","outputs":[{"name":"ret","type":"string"}],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"name","type":"string"}],"name":"setName","outputs":[],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"hash","type":"bytes32"}],"name":"setContent","outputs":[],"payable":false,"type":"function"},
            {"constant":true,"inputs":[{"name":"node","type":"bytes32"}],"name":"pubkey","outputs":[{"name":"x","type":"bytes32"},{"name":"y","type":"bytes32"}],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"node","type":"bytes32"},{"name":"addr","type":"address"}],"name":"setAddr","outputs":[],"payable":false,"type":"function"},
            {"inputs":[{"name":"ensAddr","type":"address"}],"payable":false,"type":"constructor"},
            {"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":false,"name":"a","type":"address"}],"name":"AddrChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":false,"name":"hash","type":"bytes32"}],"name":"ContentChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":false,"name":"name","type":"string"}],"name":"NameChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":true,"name":"contentType","type":"uint256"}],"name":"ABIChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":false,"name":"x","type":"bytes32"},{"indexed":false,"name":"y","type":"bytes32"}],"name":"PubkeyChanged","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"node","type":"bytes32"},{"indexed":true,"name":"indexedKey","type":"string"},{"indexed":false,"name":"key","type":"string"}],"name":"TextChanged","type":"event"}
        ]
    ),

    // https://etherscan.io/tx/0x557cb63ddad5840fa55a091f77acc2c822857e0e119639ba84f073b5b13f266e
    ReverseRegistrar: compiler.makeCode(
        'ReverseRegistrar',
        //'0x6060604052341561000c57fe5b6040516040806102c98339810160405280516020909101515b60008054600160a060020a031916600160a060020a03841617905560018190555b50505b610271806100586000396000f300606060405263ffffffff60e060020a6000350416631e83409a81146100425780633f15457f14610070578063bffbe61c1461009c578063faff50a8146100ca575bfe5b341561004a57fe5b61005e600160a060020a03600435166100ec565b60408051918252519081900360200190f35b341561007857fe5b6100806101a2565b60408051600160a060020a039092168252519081900360200190f35b34156100a457fe5b61005e600160a060020a03600435166101b1565b60408051918252519081900360200190f35b34156100d257fe5b61005e6101df565b60408051918252519081900360200190f35b600060006100f9336101e5565b60008054600154604080517f06ab5923000000000000000000000000000000000000000000000000000000008152600481019290925260248201859052600160a060020a0388811660448401529051949550909116926306ab59239260648084019391929182900301818387803b151561016f57fe5b60325a03f1151561017c57fe5b505060015460408051918252602082018490528051918290030190209250505b50919050565b600054600160a060020a031681565b60006001546101bf836101e5565b60408051928352602083019190915280519182900301902090505b919050565b60015481565b60007f303132333435363738396162636465660000000000000000000000000000000060285b60001901600f841682901a815360109093049260001901600f841682901a81536010840493508061020b576028600020925050505b9190505600a165627a7a723058206551702d4f0ded6074c9fd4371888253374d3ab7f9ea60e48f1a3d3a74bb3a7b0029',
        '0x6060604052341561000c57fe5b6040516040806108ae8339810160405280516020909101515b60008054600160a060020a03808516600160a060020a0319928316178084556001805486841694169390931790925560408051602090810185905281517f02571be30000000000000000000000000000000000000000000000000000000081527f91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e26004820152915193909216926302571be39260248084019391929182900301818787803b15156100d257fe5b6102c65a03f115156100e057fe5b505060405151915050600160a060020a038116156101835780600160a060020a0316631e83409a336000604051602001526040518263ffffffff167c01000000000000000000000000000000000000000000000000000000000281526004018082600160a060020a0316600160a060020a03168152602001915050602060405180830381600087803b151561017157fe5b6102c65a03f1151561017f57fe5b5050505b5b5050505b610717806101976000396000f300606060405236156100755763ffffffff7c01000000000000000000000000000000000000000000000000000000006000350416630f5a546681146100775780631e83409a146100ab5780633f15457f146100d9578063828eab0e14610105578063bffbe61c14610131578063c47f00271461015f575bfe5b341561007f57fe5b610099600160a060020a03600435811690602435166101c7565b60408051918252519081900360200190f35b34156100b357fe5b610099600160a060020a03600435166104f4565b60408051918252519081900360200190f35b34156100e157fe5b6100e9610509565b60408051600160a060020a039092168252519081900360200190f35b341561010d57fe5b6100e9610518565b60408051600160a060020a039092168252519081900360200190f35b341561013957fe5b610099600160a060020a0360043516610527565b60408051918252519081900360200190f35b341561016757fe5b610099600480803590602001908201803590602001908080601f0160208091040260200160405190810160405280939291908181526020018383808284375094965061056195505050505050565b60408051918252519081900360200190f35b6000600060006101d63361066b565b604080516000805160206106cc83398151915281526020808201849052825191829003830182206000805493830181905284517f02571be3000000000000000000000000000000000000000000000000000000008152600481018390529451919850949650600160a060020a03909216936302571be39360248082019492918390030190829087803b151561026757fe5b6102c65a03f1151561027557fe5b505060405151915050600160a060020a0384161580159061032257506000805460408051602090810184905281517f0178b8bf000000000000000000000000000000000000000000000000000000008152600481018890529151600160a060020a0390931693630178b8bf936024808501949192918390030190829087803b15156102fc57fe5b6102c65a03f1151561030a57fe5b505060405151600160a060020a038681169116141590505b1561044b5730600160a060020a031681600160a060020a03161415156103d25760008054604080517f06ab59230000000000000000000000000000000000000000000000000000000081526000805160206106cc833981519152600482015260248101869052600160a060020a033081166044830152915191909216926306ab5923926064808201939182900301818387803b15156103bd57fe5b6102c65a03f115156103cb57fe5b5050503090505b60008054604080517f1896f70a00000000000000000000000000000000000000000000000000000000815260048101879052600160a060020a03888116602483015291519190921692631896f70a926044808201939182900301818387803b151561043957fe5b6102c65a03f1151561044757fe5b5050505b600160a060020a03818116908616146104eb5760008054604080517f06ab59230000000000000000000000000000000000000000000000000000000081526000805160206106cc833981519152600482015260248101869052600160a060020a038981166044830152915191909216926306ab5923926064808201939182900301818387803b15156104d957fe5b6102c65a03f115156104e757fe5b5050505b5b505092915050565b60006105018260006101c7565b90505b919050565b600054600160a060020a031681565b600154600160a060020a031681565b60006000805160206106cc8339815191526105418361066b565b60408051928352602083019190915280519182900301902090505b919050565b60015460009061057b903090600160a060020a03166101c7565b600154604080517f773722130000000000000000000000000000000000000000000000000000000081526004810184815260248201928352865160448301528651949550600160a060020a03909316936377372213938693889391929091606401906020850190808383821561060c575b80518252602083111561060c57601f1990920191602091820191016105ec565b505050905090810190601f1680156106385780820380516001836020036101000a031916815260200191505b509350505050600060405180830381600087803b151561065457fe5b6102c65a03f1151561066257fe5b5050505b919050565b60007f303132333435363738396162636465660000000000000000000000000000000060285b60001901600f841682901a815360109093049260001901600f841682901a815360108404935080610691576028600020925050505b919050560091d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2a165627a7a72305820b5a0fc071ea98f50e75fb7b3a50f25e129679487596a27697ba42f422dc0d6dc0029',
        [
            {"constant":false,"inputs":[{"name":"owner","type":"address"},{"name":"resolver","type":"address"}],"name":"claimWithResolver","outputs":[{"name":"node","type":"bytes32"}],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"owner","type":"address"}],"name":"claim","outputs":[{"name":"node","type":"bytes32"}],"payable":false,"type":"function"},
            {"constant":true,"inputs":[],"name":"ens","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},
            {"constant":true,"inputs":[],"name":"defaultResolver","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},
            {"constant":true,"inputs":[{"name":"addr","type":"address"}],"name":"node","outputs":[{"name":"ret","type":"bytes32"}],"payable":false,"type":"function"},
            {"constant":false,"inputs":[{"name":"name","type":"string"}],"name":"setName","outputs":[{"name":"node","type":"bytes32"}],"payable":false,"type":"function"},
            {"inputs":[{"name":"ensAddr","type":"address"},{"name":"resolverAddr","type":"address"}],"payable":false,"type":"constructor"}
        ]
    ),
}

function hex(value) {
    value = ethers.utils.bigNumberify(value).toHexString();
    while (value.length > 3 && value.substring(0, 3) === '0x0') {
        value = '0x' + value.substring(3);
    }
    return value;
}

function keccak(text) {
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(text));
}


function MockJsonRpcProvider(ethProvider) {
    this._ethProvider = ethProvider;
}
ethers.providers.JsonRpcProvider.inherits(MockJsonRpcProvider);

ethers.utils.defineProperty(MockJsonRpcProvider.prototype, 'send', function(method, params) {
    var payload = {
        method: method,
        params: params,
        id: 42,
        jsonrpc: "2.0"
    };

    var self = this;
    return new Promise(function(resolve, reject) {
        self._ethProvider.sendAsync(payload, function(error, payload) {
            if (error) {
                reject(new Error(error));
            } else {
                resolve(payload.result);
            }
        });
    });
});


function TestProvider(accounts) {
    if (!(this instanceof TestProvider)) { throw new Error('missing new'); }

    var ensOwner = new ethers.Wallet(ethers.utils.randomBytes(32), this);
    var root = new ethers.Wallet(ethers.utils.randomBytes(32), this);

    var network = {
        name: 'test',
        ensAddress: ethers.utils.getContractAddress({ from: ensOwner.address, nonce: 0 }),
        chainId: 43
    }

    ethers.providers.Provider.call(this, network);

    var self = this;

    if (!accounts) { accounts = []; }

    var gasPrice = ethers.utils.bigNumberify('50000000000');
    var gasLimit = ethers.utils.bigNumberify(21000);

    var options = {
        accounts: [
            { secretKey: root.privateKey, balance: hex(ethers.utils.parseEther('1000000.0')) },
            { secretKey: ensOwner.privateKey, balance: hex(ethers.utils.parseEther('1000000.0')) },
            { secretKey: DebugPrinter.account.privateKey, balance: hex(ethers.utils.parseEther('1000000.0')) },
        ],
        locked: false
    };

    this._debug = [];

    Object.defineProperty(this, 'debug', {
        get: function () {
            return self._debug.slice();
        }
    });

    Object.defineProperty(this, 'clearDebug', {
        value: function() {
            self._debug = [];
        }
    });

    this.accounts = {
        root: root,
        ensOwner: ensOwner,
    };

    accounts.forEach(function(account, i) {
        account.provider = this;
        this.accounts[i] = account;
        options.accounts.push({
            secretKey: account.privateKey,
            balance: hex(ethers.utils.parseEther('1000000.0'))
        });
    }, this);

    this._debugPrinter = new DebugPrinter();

    function debugPrint(opts) {
        var value = self._debugPrinter.process(opts.data);

        if (value.type) {
            self._debug.push(value);
            console.log('//! Debug(line = ' + value.line + ', type = ' + value.type + '): ', value.data);
        } else {
           console.log(value);
        }

        var result = {
            "gasUsed": new BN(0),
            "return": new BN(1),
            "exception": 1,
        };
        return result;
    }

    function setupVm(vm) {
        if (vm.stateManager._testProviderSetup) { return; }
        vm.stateManager._testProviderSetup = true;

        // Inject a default account (erialized) into the trie so we can hijack calls
        var debugAddress = DebugPrinter.address.substring(2).toLowerCase();

        // Hijack the getContractCode to return a pre-compiled debug printer
        var getContractCode = vm.stateManager.getContractCode;
        vm.stateManager.getContractCode = function(address, callback) {
             if (address.toString('hex') === debugAddress) {
                 callback(null, debugPrint, true);
                 return;
             }
             return getContractCode.call(vm.stateManager, address, callback);
         }
    }

    this._providerPromise = new Promise(function(resolve, reject) {
        var provider = new MockJsonRpcProvider(TestRPC.provider(options));
        var seq = Promise.resolve();

        // Deploy the DebugPrinter contract; not actually used since we intercept it
        // but we need to make sure we trigger a contract lookup.
        seq = seq.then(function() {
            return provider.sendTransaction(DebugPrinter.deployTransaction).then(function(hash) {
                var stateManager = provider._ethProvider;
                return new Promise(function(resolve, reject) {
                    var timer = setInterval(function() {
                        if(stateManager.manager.initialized) {
                            setupVm(stateManager.manager.state.blockchain.vm);
                            clearInterval(timer);
                            resolve();
                        }
                    }, 1);
                });
            });
        });

        // Hijack the runVm function so we can hijack the stateManager getContractCode
        seq = seq.then(function() {
            var vmProvider = provider._ethProvider.engine._providers[5];
            vmProvider.runVm = function(payload, cb) {
                var self = this

                var blockData = self.currentBlock
                var block = blockFromBlockData(blockData)
                var blockNumber = addHexPrefix(blockData.number.toString('hex'))

                // create vm with state lookup intercepted
                //var vm = self.vm = createVm(self.engine, blockNumber, 
                var vm = createVm(self.engine, blockNumber, {
                    enableHomestead: true
                });

                setupVm(vm);

                // Create faux transaction
                var txParams = payload.params[0]
                var tx = new FakeTransaction({
                    to: txParams.to ? addHexPrefix(txParams.to) : undefined,
                    from: txParams.from ? addHexPrefix(txParams.from) : undefined,
                    value: txParams.value ? addHexPrefix(txParams.value) : undefined,
                    data: txParams.data ? addHexPrefix(txParams.data) : undefined,
                    gasLimit: txParams.gas ? addHexPrefix(txParams.gas) : block.header.gasLimit,
                    gasPrice: txParams.gasPrice ? addHexPrefix(txParams.gasPrice) : undefined,
                    nonce: txParams.nonce ? addHexPrefix(txParams.nonce) : undefined,
                })

                vm.runTx({
                    tx: tx,
                    block: block,
                    skipNonce: true,
                    skipBalance: true
                }, function(err, results) {
                    if (err) return cb(err)
                    if (results.error != null) {
                        return cb(new Error("VM error: " + results.error))
                    }

                    if (results.vm && results.vm.exception !== 1) {
                        return cb(new Error("VM Exception while executing " + payload.method + ": " + results.vm.exceptionError))
                    }

                    cb(null, results)
                })
            }
        });

        function deploy(code, params, account) {
            // Create a wallet with the internal provider
            var wallet = new ethers.Wallet(account.privateKey, provider);

            var tx = code.getDeployTransaction.apply(code, params);
            return wallet.sendTransaction(tx).then(function(tx) {
                return code.connect(ethers.utils.getContractAddress(tx), account);
            });
        }

        // Deploy the ENS contract
        seq = seq.then(function() {
            return deploy(codes.ENS, [], ensOwner).then(function(ens) {
                self.ens = ens;
            });
        });

        // Deploy a Public Resolver contract
        seq = seq.then(function() {
            return deploy(codes.PublicResolver, [ self.ensAddress ], ensOwner).then(function(resolver) {
                self.publicResolver = resolver;
            });
        });

        // Deploy a Reverse Registrar
        seq = seq.then(function() {
            return deploy(codes.ReverseRegistrar, [ self.ensAddress, self.publicResolver.address ], ensOwner).then(function(reverseRegistrar) {
                self._reverseRegistrar = reverseRegistrar;
            });
        });

        // Set the owner of 'eth' to the ethOwner
        seq = seq.then(function() {
            var signer = new ethers.Wallet(ensOwner.privateKey, provider);
            var ens = codes.ENS.connect(self.ensAddress, signer);

            return ens.setSubnodeOwner('0x0',keccak('eth'), ensOwner.address);
        });

        // Set the owner of 'addr.reverse' to the reverse registrar
        seq = seq.then(function() {
            var signer = new ethers.Wallet(ensOwner.privateKey, provider);
            var ens = codes.ENS.connect(self.ensAddress, signer);

            return ens.setSubnodeOwner('0x0',keccak('reverse'), ensOwner.address);
        });

        seq = seq.then(function() {
            var signer = new ethers.Wallet(ensOwner.privateKey, provider);
            var ens = codes.ENS.connect(self.ensAddress, signer);

            return ens.setSubnodeOwner(ethers.utils.namehash('reverse'), keccak('addr'), self._reverseRegistrar.address);
        });

        seq.then(function() {
            resolve(provider);
        }, function(error) {
            reject(error);
        });
    });
}
ethers.providers.Provider.inherits(TestProvider);

ethers.utils.defineProperty(TestProvider.prototype, 'perform', function(method, params) {
    this.clearDebug();

    var self = this;

    return this._providerPromise.then(function(provider) {
        return provider.perform(method, params);
    }).catch(function (error) {
        console.log(method, params, error);
        /*
        if (error.message.substring(0, 9) === 'Error: VM') {
            var state = self._debugPrinter.state;
            var vmError = error;
            var error = new Error('Runtime Error - near ' + state.filename + ':' + state.method);
            error.vmError = vmError;
            error.runtimeSolidityError = state;
            self._debug.push({
                error: error,
                filename: state.filename,
                line: state.line,
                method: state.method,
            });
        }
        */
        throw error;
    });
});

TestProvider.prototype.registerLabel = function(label, account) {
    var name = label + '.eth';
    var nodehash = ethers.utils.namehash(name);

    var self = this;

    return this._providerPromise.then(function(provider) {

        // Connect to ENS as the account
        var ens = codes.ENS.connect(self.ensAddress, account);
        var resolver = codes.PublicResolver.connect(self.publicResolver.address, account);
        var reverseRegistrar = codes.ReverseRegistrar.connect(self._reverseRegistrar.address, account);

        // Set the owner of the label to the account
        var seq = self.ens.setSubnodeOwner(ethers.utils.namehash('eth'), keccak(label), account.address);

        // Set the resolver
        seq = seq.then(function() {
            return ens.setResolver(nodehash, resolver.address);
        });

        // Set the address
        seq = seq.then(function() {
            return resolver.setAddr(nodehash, account.address);
        });

        // Set the reverse registrar value
        seq = seq.then(function() {
            return reverseRegistrar.setName(name);
        });

        return seq;
    });
}

module.exports = TestProvider;
