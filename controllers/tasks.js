var uuid = require('node-uuid'),
    everyauth = require('everyauth'),
    async = require('async'),
    mongoose = require('mongoose'),
    task = require('../models/task.js');

module.exports = Tasks;

function Tasks(mongoConnection, fbClient) {
     mongoose.connect(mongoConnection);
    this.fbClient = fbClient;
};

Tasks.prototype = {
    
    getFacebookFriends: function(token, callback){
		this.fbClient.getSessionByAccessToken(token)(
		    function gotSession(session){
				if(!session){
				    callback(new Error("Could not establish Facebook session"));
				    return;
				}
				
				session.graphCall('/me/friends', {})(
				    function gotFriends(result) {
						if(result.error){
						    callback(new Error("Could not get friends from \
						    	Facebook. The Graph API returned this: " + 
						    	result.error.type + " " + 
						    	result.error.message));
						    return;
						}

						result.data.sort(function nameComparer(a, b){
						    if(a.name == b.name) return 0
						    else if (a.name > b.name) return 1
						    else if (a.name < b. name) return -1
						});
				    
						callback(null, result.data);
				    });
		    });
    },

    showItems: function (req, res) {
		var self = this;
		async.parallel({
		    friends: function getFriends(callback){
				if(req.loggedIn){
				    self.getFacebookFriends(
						req.session.auth.facebook.accessToken, 
						callback);
				} else {
				    callback(null, []);
				}
		    },
		    tasks: function getTasks(callback){
		    	task.find({completed: false}, callback);
		    }
		}, function gotFriendsAndTasks(error, results){
		    if(error){
				throw error;
		    }

		    res.render('tasks', {
				title: 'Tasks.  ',
				tasklist: results.tasks || [],
				friends: results.friends || []
		    });	    
		});
    },
    
    newItem: function (req, res) {
		var self = this;
	    
        var item = req.body.item;
        var newTask = new task();
        newTask.name = item.name;
        newTask.category = item.category;
        newTask.date = item.date;
        newTask.assignedTo = item.assignedTo;
        
		// Fish out the friend name from Facebook
		if(req.loggedIn){
		    self.getFacebookFriends(
				req.session.auth.facebook.accessToken, 
				function gotFacebookFriends(error, friends){
			    	if(error){
						throw error;
			    	}
			    
			    	async.detect(friends, 
						function friendIterator(friend, callback){
			            	callback(friend.id === item.assignedTo);
						}, matchingFriendFound);
				});
		}

		function matchingFriendFound(result){
		    newTask.assignedToName = result.name;
		    newTask.save(function savedTask(error){
		    	if(error){	
					throw error;
			    }
				self.showItems(req, res);
    		});
		}
    },
    complete: function(req, res){
        var self = this;

        console.log(req.body.item.id);

        task.update(
        	{_id: req.body.item.id},
        	{ completed: true}, function updatedTask(error) {
          		if(error){
                	throw error;
				}
                self.showItems(req, res);
        });
    }
};