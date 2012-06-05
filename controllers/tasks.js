var azure = require('azure'),
    uuid = require('node-uuid'),
    everyauth = require('everyauth'),
    async = require('async'),
    tableName = 'tasks',
    partitionKey = 'partition1';

module.exports = Tasks;

function Tasks(storageClient, fbClient) {
    this.storageClient = storageClient;
    storageClient.createTableIfNotExists(tableName, 
        function tableCreated(error){
		    if(error){
		        throw error;
		    }
        });
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
				var query = azure.TableQuery
				    .select()
				    .from(tableName)
				    .where('completed eq ?', 'false');
				
				self.storageClient.queryEntities(query, callback);
		    }
		}, function gotFriendsAndTasks(error, results){
		    if(error){
				throw error;
		    }

		    res.render('tasks', {
				title: 'Tasks.  ',
				tasklist: results.tasks[0] || [],
				friends: results.friends || []
		    });	    
		});
    },
    
    newItem: function (req, res) {
		var self = this;
	    
        var item = req.body.item;
        item.RowKey = uuid();
        item.PartitionKey = partitionKey;
        item.completed = false;
        
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
		    item.assignedToName = result.name;
		    
		    self.storageClient.insertEntity(tableName, item, 
		        function entityInserted(error) {
			    	if(error){	
						throw error;
			    	}
			    	self.showItems(req, res);
			});
		}
    },
    complete: function(req, res){
        var self = this;

        self.storageClient.queryEntity(tableName, partitionKey, 
            req.body.item.RowKey, function entityQueried(error, entity){
                if(error){
                    throw error;
                }
                entity.completed = true;

                self.storageClient.updateEntity(tableName, entity, 
                    function entityUpdated(error){
                        if(error){
                            throw error;
                        }
                        self.showItems(req, res);
                    });           
            });

    }
};