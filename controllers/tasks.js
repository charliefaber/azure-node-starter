var uuid = require('node-uuid'),
    everyauth = require('everyauth'),
    async = require('async'),
	sql = require('node-sqlserver');

module.exports = Tasks;

function Tasks(conn, fbClient) {
    this.conn = conn;
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
				var select = "select * from tasks where completed = 0";
		    	sql.query(self.conn, select, callback);
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
			var insert = "insert into tasks (name, category, date, assignedTo, assignedToName, completed) values (?, ?, GETDATE(), ?, ?, 0)";
			sql.query(self.conn, insert, 
				[item.name, item.category, item.assignedTo, result.name], 
				function inserted(error) {
					if(error){
						throw error;
					}
					self.showItems(req, res);
				});
		}
    },
    complete: function(req, res){
        var self = this;
        var update = "update tasks set completed = 1 where id in (" + 
        	req.body.item.id + ")";
        sql.query(self.conn, update, function(error) {
            if(error) {
                throw error;
            }
            self.showItems(req, res);
        });
    }
};