'use strict';

angular.module('insight.address').controller('AddressController',
  function($scope, $rootScope, $routeParams, $location, Global, Address, getSocket) {
    $scope.global = Global;

    var _cleanAssetBalances = function (balanceObj) {
        // Turn the balance obj into an array [{ name: IPHONE!, totalRecieved: 0, totalSpent: 0, balance: 1 }]
        var finalArray = [];
        for(var key in balanceObj) {
            if (key !== 'MEWC') {
                var name = key;
                var totalReceived = balanceObj[key].totalReceived / 100000000;
                var totalSpent = balanceObj[key].totalSpent / 100000000;
                var balance = balanceObj[key].balance / 100000000;
                finalArray.push({ name: name, totalReceived: totalReceived, totalSpent: totalSpent, balance: balance});
            }
        }
        $scope.address.assetBalances = finalArray;
    };

    var socket = getSocket($scope);
    var addrStr = $routeParams.addrStr;

    var _startSocket = function() {
      socket.on('meowcoind/addresstxid', function(data) {
        if (data.address === addrStr) {
          $rootScope.$broadcast('tx', data.txid);
          var base = document.querySelector('base');
          var beep = new Audio(base.href + '/sound/transaction.mp3');
          beep.play();
        }
      });
      socket.emit('subscribe', 'meowcoind/addresstxid', [addrStr]);
    };

    var _stopSocket = function () {
      socket.emit('unsubscribe', 'meowcoind/addresstxid', [addrStr]);
    };

    socket.on('connect', function() {
      _startSocket();
    });

    $scope.$on('$destroy', function(){
      _stopSocket();
    });

    $scope.params = $routeParams;

    $scope.findOne = function() {
      $rootScope.currentAddr = $routeParams.addrStr;
      _startSocket();

      Address.get({
          addrStr: $routeParams.addrStr
        },
        function(address) {
            $rootScope.titleDetail = address.addrStr.substring(0, 7) + '...';
            $rootScope.flashMessage = null;
            $scope.address = address;
            _cleanAssetBalances(address.balances);
        },
        function(e) {
          if (e.status === 400) {
            $rootScope.flashMessage = 'Invalid Address: ' + $routeParams.addrStr;
          } else if (e.status === 503) {
            $rootScope.flashMessage = 'Backend Error. ' + e.data;
          } else {
            $rootScope.flashMessage = 'Address Not Found';
          }
          $location.path('/');
        });
    };

  });
