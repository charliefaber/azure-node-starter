
/**
 * Module dependencies.
 */

var express = require('express')
    less = require('less'),
    everyauth = require('everyauth'),
    nconf = require('nconf'),
    azure = require('azure'),
    uuid = require('node-uuid');

var app = module.exports = express.createServer();

nconf.file({file: 'settings.json'});

everyauth.debug = true;

// Configure Facebook auth
var usersById = {},
    nextUserId = 0,
    usersByFacebookId = {};

everyauth.
    everymodule.
    findUserById(function (id, callback) {
	callback(null, usersById[id]);
    });

everyauth.
    facebook.
    appId(nconf.get('facebook:applicationId')).
    appSecret(nconf.get('facebook:applicationSecret')).
    findOrCreateUser(
	function(session, accessToken, accessTokenExtra, fbUserMetadata){
	    return usersByFacebookId[fbUserMetadata.claimedIdentifier] || 
		(usersByFacebookId[fbUserMetadata.claimedIdentifier] = 
		 addUser('facebook', fbUserMetadata));
	}).
    redirectPath('/');

function addUser (source, sourceUser) {
    var user =  {id: ++nextUserId, source: sourceUser};
    usersById[nextUserId] = user;
    return user;
}
// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views'); 
  app.set('view engine', 'jade');  
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({secret: 'azure zomg'}));
  app.use(require('./middleware/locals'));
  app.use(express.compiler({ src: __dirname + '/public', enable: ['less']}));
  app.use(everyauth.middleware());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes
require('./routes/home')(app);


// socket.io configuration
//var buffer = [];
var io = require('socket.io').listen(app);
var serviceBusSubscription = uuid.v4();
var serviceBusClient = azure.createServiceBusService(
  nconf.get('azure:serviceBusNamespace'), 
  nconf.get('azure:serviceBusAccessKey'));


io.configure(function () { 
  io.set("transports", ["xhr-polling"]); 
  io.set("polling duration", 100); 
});

serviceBusCreateSubscriptions();

function setUpSocketIo(){
  io.sockets.on('connection', function (socket) {

    serviceBusReceive(socket, 'message');
    serviceBusReceive(socket, 'announcement');
    
    socket.on('setname', function(name) {
      socket.set('name', name, function() {
        serviceBusSend({announcement: name + ' connected'}, 'announcement');
      });
    });
    socket.on('message', function (message) {
      socket.get('name', function(err, name){
        serviceBusSend({ message: [name, message] }, 'message');        
      });
    });
    socket.on('disconnect', function() {
      socket.get('name', function(err, name) {
        serviceBusSend({announcement: name + ' disconnected' }, 'announcement');
      })
    })
  });
}

function serviceBusCreateSubscriptions()
{
  serviceBusClient.createSubscription('message', 
    serviceBusSubscription, function messageSubscriptionCreated(error) {
      if (error) {
        throw error;
      } else {
        serviceBusClient.createSubscription('announcement', serviceBusSubscription,
          function announcementSubscriptionCreated(error){
            if(error){
              throw error;
            } else {
              setUpSocketIo();
            }
          });
      }
  });
}

function serviceBusSend(message, topic){
  var msg = JSON.stringify(message);
  serviceBusClient.sendTopicMessage(topic, 
    msg, 
    function messageSent(error) {
      if (error) {
        throw error;
      } else {
        console.log('Message queued up to Service Bus: ' + msg);
      }
    });
}

function serviceBusReceive(socket, topic){
  serviceBusClient.receiveSubscriptionMessage(topic,
    serviceBusSubscription, {timeoutIntervalInS: 5}, 
    function messageReceived(error, message) {
      if (error) {
        if(error === 'No messages to receive'){
          console.log('Resetting Service Bus receive');
          serviceBusReceive(socket, topic);
        } else {
          console.log(error);
        }
      } else {
        console.log('Received Service Bus message ' + 
          JSON.stringify(message));
        socket.broadcast.emit(topic, JSON.parse(message.body));
      }
    });
}

everyauth.helpExpress(app);

app.listen(process.env.PORT || 3000);
//console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);

