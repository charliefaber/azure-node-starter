module.exports = function(app) {

    var Tasks = require('../controllers/tasks'),
        nconf = require('nconf'),
        Fb = require('facebook-client').FacebookClient;

    // home page
    // app.get('/', function(req, res) {
    //     res.render('index', { title: 'Home Page.  ' })
    // });
    
    // tasks page
    var tasks = new Tasks(
        nconf.get('azure:sqlConnectionString'),
        new Fb(nconf.get('facebook:applicationId'), nconf.get('facebook:applicationSecret'))
    );
    app.get('/', tasks.showItems.bind(tasks));
    app.post('/newitem', tasks.newItem.bind(tasks));
    app.post('/complete', tasks.complete.bind(tasks));

    // chat area
    app.get('/chat', function(req, res) {
        res.render('chat', { title: 'Chat with Me!  ' })
    });

    // about page
    app.get('/about', function(req, res) {
        res.render('about', { title: 'About Me.  ' })
    });    
}
