require('./settings')

// Check new mentions of the account
var referenceDate = new Date();
function checkMentions(){
  var testDate = referenceDate;

  T.get('statuses/mentions_timeline', function (err, data, response) {
    if(!!data){ // Data is not null
      data.reverse();
      for(tweet in data){
        testDate = new Date(data[tweet].created_at);
        if(testDate > referenceDate){ // New tweet
          var re = new RegExp("^@([^ ]+) (.+) -(>|&gt;) (.+)$");
          if(re.test(data[tweet].text)){ // Test "origin -> destination"
            // Get data
            var matches = re.exec(data[tweet].text);
            var origin = getStationData(matches[2]);
            var destination = getStationData(matches[4]);
            var user = data[tweet].user.screen_name;

            // Reply to user
            postNextTrainText(origin, destination, user, false);
          }
        }
      }
      referenceDate = testDate;
    }
  });
}

// Check DM
var referenceDateDM = new Date();
function checkDM(){
  var testDate = referenceDateDM;

  T.get('direct_messages', function (err, data, response) {
    if(!!data){ // Data is not null
      data.reverse();
      for(dm in data){
        testDate = new Date(data[dm].created_at);
        if(testDate > referenceDateDM){ // New DM
          var re = new RegExp("(.+) -(>|&gt;) (.+)$");
          if(re.test(data[dm].text)){ // Test "origin -> destination"
            // Get data
            var matches = re.exec(data[dm].text);
            var origin = getStationData(matches[1]);
            var destination = getStationData(matches[3]);
            var user = data[dm].sender_id;

            // Reply to user
            postNextTrainText(origin, destination, user, true);
          }
        }
      }
      referenceDateDM = testDate
    }
  });
}

/* Get station data from: a station name, a city name, or a station code
   see stations.json
*/
function getStationData(stationName){
  var stations = require('./stations.json'); // Get stations list
  var city, station, code;
  stationName = String(stationName);

  // Search in the stations list
  for(i in stations){
    city = String(stations[i].fields.commune);
    station = String(stations[i].fields.libelle_point_d_arret);
    code = String(stations[i].fields.code_uic);

    if(city.toLowerCase().indexOf(stationName.toLowerCase()) > -1 ||
    station.toLowerCase().indexOf(stationName.toLowerCase()) > -1 ||
    code.toLowerCase().indexOf(stationName.toLowerCase()) > -1){
      // Station found
      var data = {city:city, station:station, code:code};
      return data;
    }
  }

  return null; // Station not found
}

// Follow new followers
function followUsers(){
  T.get('followers/ids', {screen_name: 'bot_transilien'}, function (err, data, response) {
    var followers = data.ids;

    T.get('friends/ids', {screen_name: 'bot_transilien'}, function (err, data, response) {
      var friends = data.ids;
      var ids = [];

      for(i in followers){
        if(friends.indexOf(followers[i]) == -1){ // Follower to follow
          ids.push(followers[i]);
        }
        else { // We reach a followed user => break
          break;
        }
      }

      // Follow users
      for(i in ids){
        T.post('friendships/create', { user_id: ids[i] }, function(err, data, response) {
          console.log(data);
        });
      }
    });
  });
}

/* Post to a user the text for the two next trains
   origin: code of the origin station
   destination: code of the destination station
   user: screen_name of the user or user id for a DM
   dm: true => send DM, false => send mention
*/
function postNextTrainText(origin, destination, user, dm){
  if(!origin || !destination){ // Station does not exist
    // Post error message
    if(dm){
      T.post('direct_messages/new', { user_id: user, text: "Gares non trouvées."}, function(err, data, response) {
        console.log(data);
      });
    }else{
      T.post('statuses/update', { status: "@" + user + " Gares non trouvées."}, function(err, data, response) {
        console.log(data);
      });
    }

    return;
  }

  // Get stations code
  origin = origin.code;
  destination = destination.code;

  var http = require('http');

  // Call transilien API
  var options = {
    host: 'api.transilien.com',
    port: 80,
    path: '/gare/'+ origin +'/depart/'+ destination +'/',
    headers: {
      'Authorization': 'Basic ' + new Buffer(transilien_user + ':' + transilien_pass).toString('base64')
    }
  };

  request = http.get(options, function(res){
    var xml = "";
    res.on('data', function(data) {
      xml += data;
    });

    res.on('end', function() {
      var parseString = require('xml2js').parseString;
      parseString(xml, function (err, result) {
        if(!result.passages.train){ // Itinary not found
          // Post error message
          if(dm){
            T.post('direct_messages/new', { user_id: user, text: "Itinéraire non trouvé."}, function(err, data, response) {
              console.log(data);
            });
          }else{
            T.post('statuses/update', { status: "@" + user + " Itinéraire non trouvé."}, function(err, data, response) {
              console.log(data);
            });
          }

          return;
        }

        // Train 1 data
        var re = new RegExp("^.+/.+/.+ (.+)$");
        var train1Data = result.passages.train[0];
        var term = getStationData(train1Data.term);
        var matches = re.exec(train1Data.date[0]._);
        var date = matches[1];
        var train1 = date + ": " + train1Data.miss + " à destination de " + term.station;

        // Train 2 data
        var train2Data = result.passages.train[1];
        var term = getStationData(train2Data.term);
        var matches = re.exec(train2Data.date[0]._);
        var date = matches[1];
        var train2 = date + ": " + train2Data.miss + " à destination de " + term.station;

        // Post message
        if(dm){
          T.post('direct_messages/new', { user_id: user, text: train1 + " suivi par " + train2}, function(err, data, response) {
            console.log(data);
          });
        }else{
          T.post('statuses/update', { status: "@" + user + " " + train1 + " suivi par " + train2}, function(err, data, response) {
            console.log(data);
          });
        }
      });
    });
  });
}

// The bot
function bot(){
  followUsers();
  checkMentions();
  checkDM();
}

setInterval(bot, 60000);
