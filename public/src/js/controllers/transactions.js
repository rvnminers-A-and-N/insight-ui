'use strict';

angular.module('insight.transactions').controller('transactionsController',
function($http, $scope, $rootScope, $routeParams, $location, Global, Transaction, TransactionsByBlock, TransactionsByAddress) {
  $scope.global = Global;
  $scope.loading = false;
  $scope.loadedBy = null;

  var pageNum = 0;
  var pagesTotal = 1;
  var COIN = 100000000;
  // Track addresses to find duplicates in vout (returns)
  var vinAddresses = [];

  var _aggregateItems = function(items, type, txIndex) {
    // When we get all transactions, look through each item
    // If the item has an asset we need to update the value to be that asset
    // Loop through each transaction item
    items.forEach(function(txItem) {
        // If these are vin items, grab each address to later crosscheck with vouts
        if (type === 'vin') {
            // Make sure an array exists at this txIndex, if not, make one
            if (!vinAddresses[txIndex]) { vinAddresses[txIndex] = [] };
            // Only push if an address exists
            if (txItem.addr) { vinAddresses[txIndex].push(txItem.addr); }
        } else if (type === 'vout') {
            // Cross check the vout address with the vin address to know if it matches
            var voutAddressArray = txItem.scriptPubKey.addresses || [];
            // Just use the first address (not sure if this is ideal...)
            var voutAddress = voutAddressArray[0];
            // Cross check this address with each stored vinAddress to see if we find a match
            if (vinAddresses[txIndex].indexOf(voutAddress) > -1) {
                // Address found, set address match to true
                txItem.addressMatch = true;
            }
        }
        // Check the value of this item
        // If the value is 0 or less, **ASSUME** it is an asset
        // Parse the value to get even tiny numbers...
        if (parseFloat(txItem.value, 100) <= 0) {
            // We know this item is referencing an asset value
            // Check if we've been given asset in the object already (vout)
            if (txItem.asset) {
                // We have all the asset data we need
                // Create a new assetValue key in the item data
                txItem.assetValue = txItem.asset.amount + ' ' + txItem.asset.name;
            // Item does not have an asset key (vin)
            // Also, it needs vout data
            } else if (txItem.vout) {
                // We need to make a network request to get this asset data
                var urlBase = '/api/tx/';
                var urlTxId = txItem.txid;
                var useVoutIndex = txItem.vout;
                var fullUrl = urlBase + urlTxId;
                // Make an $http network call to get assetData from vin txid
                $http({ method: 'GET', url: fullUrl, cache: true, timeout: 5000 })
                .success(function (txObj) {
                    var voutArray = txObj.vout;
                    var targetVout = voutArray[useVoutIndex];
                    var newAssetObj = targetVout.asset;
                    txItem.assetValue = newAssetObj.amount + ' ' + newAssetObj.name;
                })
                .error(function() {
                    txItem.assetValue = 'Failed to fetch asset';
                });
            // This is a vout with 0 value and no vout index
            // Typically shows 'OP_RETURN transaction [0]'
            }
        }
    });

    if (!items) return [];

    var l = items.length;

    var ret = [];
    var tmp = {};
    var u = 0;

    for(var i=0; i < l; i++) {

      var notAddr = false;
      // non standard input
      if (items[i].scriptSig && !items[i].addr) {
        items[i].addr = 'Unparsed address [' + u++ + ']';
        items[i].notAddr = true;
        notAddr = true;
      }

      // non standard output
      if (items[i].scriptPubKey && !items[i].scriptPubKey.addresses) {
        if (items[i].scriptPubKey.asm.substring(0,9) == 'OP_RETURN') {
            items[i].scriptPubKey.addresses = ['OP_RETURN transaction [' + u++ + ']'];
            items[i].scriptPubKey.type = "OP_RETURN";
            items[i].notAddr = true;
            notAddr = true;
          } else {
            items[i].scriptPubKey.addresses = ['Unparsed address [' + u++ + ']'];
            items[i].notAddr = true;
            notAddr = true;
          }
      }

      // multiple addr at output
      if (items[i].scriptPubKey && items[i].scriptPubKey.addresses.length > 1) {
        items[i].addr = items[i].scriptPubKey.addresses.join(',');
        ret.push(items[i]);
        continue;
      }

      var addr = items[i].addr || (items[i].scriptPubKey && items[i].scriptPubKey.addresses[0]);

      if (!tmp[addr]) {
        tmp[addr] = {};
        tmp[addr].valueSat = 0;
        tmp[addr].count = 0;
        tmp[addr].addr = addr;
        tmp[addr].items = [];
      }
      tmp[addr].isSpent = items[i].spentTxId;

      tmp[addr].doubleSpentTxID = tmp[addr].doubleSpentTxID   || items[i].doubleSpentTxID;
      tmp[addr].doubleSpentIndex = tmp[addr].doubleSpentIndex || items[i].doubleSpentIndex;
      tmp[addr].dbError = tmp[addr].dbError || items[i].dbError;
      tmp[addr].valueSat += Math.round(items[i].value * COIN);
      tmp[addr].items.push(items[i]);
      tmp[addr].notAddr = notAddr;

      if (items[i].unconfirmedInput)
        tmp[addr].unconfirmedInput = true;

      tmp[addr].count++;
    }

    angular.forEach(tmp, function(v) {
      v.value    = v.value || parseInt(v.valueSat) / COIN;
      ret.push(v);
    });
    return ret;
  };

  var _processTX = function(tx, index) {
    tx.vinSimple = _aggregateItems(tx.vin, 'vin', index);
    tx.voutSimple = _aggregateItems(tx.vout, 'vout', index);
  };

  var _paginate = function(data) {
    $scope.loading = false;

    pagesTotal = data.pagesTotal;
    pageNum += 1;

    data.txs.forEach(function(tx, index) {
      _processTX(tx, index);
      $scope.txs.push(tx);
    });
  };

  var _byBlock = function() {
    TransactionsByBlock.get({
      block: $routeParams.blockHash,
      pageNum: pageNum
    }, function(data) {
      _paginate(data);
    });
  };

  var _byAddress = function () {
    TransactionsByAddress.get({
      address: $routeParams.addrStr,
      pageNum: pageNum
    }, function(data) {
      _paginate(data);
    });
  };

  var _findTx = function(txid) {
    Transaction.get({
      txId: txid
    }, function(tx) {
      $rootScope.titleDetail = tx.txid.substring(0,7) + '...';
      $rootScope.flashMessage = null;
      $scope.tx = tx;
      _processTX(tx);
      $scope.txs.unshift(tx);
    }, function(e) {
      if (e.status === 400) {
        $rootScope.flashMessage = 'Invalid Transaction ID: ' + $routeParams.txId;
      }
      else if (e.status === 503) {
        $rootScope.flashMessage = 'Backend Error. ' + e.data;
      }
      else {
        $rootScope.flashMessage = 'Transaction Not Found';
      }

      $location.path('/');
    });
  };

  $scope.findThis = function() {
    _findTx($routeParams.txId);
  };

  //Initial load
  $scope.load = function(from) {
    $scope.loadedBy = from;
    $scope.loadMore();
  };

  //Load more transactions for pagination
  $scope.loadMore = function() {
    if (pageNum < pagesTotal && !$scope.loading) {
      $scope.loading = true;

      if ($scope.loadedBy === 'address') {
        _byAddress();
      }
      else {
        _byBlock();
      }
    }
  };

  // Highlighted txout
  if ($routeParams.v_type == '>' || $routeParams.v_type == '<') {
    $scope.from_vin = $routeParams.v_type == '<' ? true : false;
    $scope.from_vout = $routeParams.v_type == '>' ? true : false;
    $scope.v_index = parseInt($routeParams.v_index);
    $scope.itemsExpanded = true;
  }
  
  //Init without txs
  $scope.txs = [];

  $scope.$on('tx', function(event, txid) {
    _findTx(txid);
  });

});

angular.module('insight.transactions').controller('SendRawTransactionController',
  function($scope, $http) {
  $scope.transaction = '';
  $scope.status = 'ready';  // ready|loading|sent|error
  $scope.txid = '';
  $scope.error = null;

  $scope.formValid = function() {
    return !!$scope.transaction;
  };
  $scope.send = function() {
    var postData = {
      rawtx: $scope.transaction
    };
    $scope.status = 'loading';
    $http.post(window.apiPrefix + '/tx/send', postData)
      .success(function(data, status, headers, config) {
        if(typeof(data.txid) != 'string') {
          // API returned 200 but the format is not known
          $scope.status = 'error';
          $scope.error = 'The transaction was sent but no transaction id was got back';
          return;
        }

        $scope.status = 'sent';
        $scope.txid = data.txid;
      })
      .error(function(data, status, headers, config) {
        $scope.status = 'error';
        if(data) {
          $scope.error = data;
        } else {
          $scope.error = "No error message given (connection error?)"
        }
      });
  };
});
