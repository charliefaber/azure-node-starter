var mongoose = require('mongoose')
  , Schema = mongoose.Schema;

  var TaskSchema = new Schema({
    name      : String
  , category  : String
  , completed : { type: Boolean, default: false }
  , date      : { type: Date, default: Date.now }
  , assignedTo  : String
  , assignedToName  : String
});


module.exports = mongoose.model('TaskModel', TaskSchema)