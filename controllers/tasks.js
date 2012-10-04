var azure = require('azure'),
    uuid = require('node-uuid'),
    everyauth = require('everyauth'),
    async = require('async'),
    formidable = require('formidable'),
    util = require('util'),
    tableName = 'tasks',
    partitionKey = 'partition1',
    containerName = 'taskfiles';

module.exports = Tasks;

function Tasks(tableClient, blobClient, fbClient) {
    this.tableClient = tableClient;
    tableClient.createTableIfNotExists(tableName, 
        function tableCreated(error){
		    if(error){
		        throw error;
		    }
        });
    this.blobClient = blobClient;
    blobClient.createContainerIfNotExists(containerName,
    	function containerCreated(error){
    		if(error){
    			throw error;
    		}
    		blobClient.setContainerAcl(containerName, 
    			azure.Constants.BlobConstants.BlobContainerPublicAccessType.BLOB,
    			function permissionSet(error2){
    				if(error2) {
    					throw error2;
    				}
    			}); 

    	});
    this.fbClient = fbClient;
};

Tasks.prototype = {
    showItems: function (req, res) {
		var self = this;

		async.parallel({
		    friends: function getFriends(callback){
				if(req.loggedIn){
				    getFacebookFriends(
						req.session.auth.facebook.accessToken, 
						self.fbClient,
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
				
				self.tableClient.queryEntities(query, callback);
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
		    getFacebookFriends(
				req.session.auth.facebook.accessToken,
				self.fbClient, 
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
		    
		    self.tableClient.insertEntity(tableName, item, 
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

		updateEntity(self.tableClient, req.body.item.RowKey, 
			'completed', true, function entityUpdated(error){
				if(error){
					throw error;
				}
				self.showItems(req, res);
			});
    },

    uploadFile : function(req, res){
    	var self = this;
    	var form = new formidable.IncomingForm();

		form.parse(req, function formParsed (err, fields, files) {
			var options = {
				contentType: files.file.type,
		    };

		    self.blobClient.createBlockBlobFromFile(containerName, 
		    	files.file.name, 
		    	files.file.path, options, 
		    	function blobUploaded (error, blob) {
		    		if(error){
		    			throw error;
		    		}
		    		updateEntity(self.tableClient, fields.RowKey,
		    			'attachment', 
		    			util.format('http://%s.blob.core.windows.net/%s/%s', 
		    				self.blobClient.storageAccount, containerName, files.file.name), 
		    			function entityUpdated(error){
		    				if(error){
								throw error;
							}
							self.showItems(req, res);
		    			});
		    	});
		});
    }
};

function getFacebookFriends(token, client, callback){
	client.getSessionByAccessToken(token)(
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
}

function updateEntity(client, key, property, value, callback){
	client.queryEntity(tableName, partitionKey, 
            key, function entityQueried(error, entity){
                if(error){
                    callback(error)
                } else {
                	entity[property] = value;

                	client.updateEntity(tableName, entity, 
                    	function entityUpdated(error2){
	                        if(error2){
	                            callback(error2);
	                        } else {
	                        	callback(null);
	                        }
                    }); 
                }          
            });

}