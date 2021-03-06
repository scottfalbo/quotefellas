'use strict';

//dependencies
const express = require ('express');
const superagent = require ('superagent');
const cors = require ('cors');
const pg = require ('pg');
const methodOverride = require ('method-override');
require ('dotenv').config();

//port setup
const port = process.env.PORT || 3000;
//turning things on
const app = express();
app.use(express.static('./public'));
app.use(express.urlencoded({extended:true}));
app.use(cors());
app.set('view engine', 'ejs');
app.use(methodOverride('_method'));
//database set up
const client = new pg.Client(process.env.DATABASE_URL);

// ---------------------------------Routes
app.get('/', homePage);
app.get('/scores', savedScores);
app.post('/scores', addScores);
app.get('/saved', savedQuote);
app.post('/save', addQuote);
app.get('/about', about);
app.post('/quiz', startQuiz);
app.post('/quiz/:id', answerCheck);
app.delete('/saved', deleteQuote);
app.put('/saved', addQuoteNote);

app.use('*', error404);

//---------------------------------Home Page
function homePage(req, res){
  res.status(200).render('index');
}

//-------------------------------- About
function about(req, res){
  res.status(200).render('about');
}

// ------------------------------------------------------ Start Quiz
//------ Global Variables
let questionArray = [];
let nameList = [];
let score = 0;
let quiz = {};
let playerName = '';
// ------ Start the journey into the multiverse worm hole
function startQuiz(req, res){
  // reset all globals
  score = 0;
  questionArray = [];
  nameList = [];
  quiz = {};
  playerName = req.body.player;
  sunnyQuotes(req, res);
}
// ---------------------Randomizes array order
function shuffleArray(array){
  for (let i = 0; i < 1000; i++) {
    let arrayOne = Math.floor((Math.random() * array.length));
    let arrayTwo = Math.floor((Math.random() * array.length));
    let reset = array[arrayOne];
    array[arrayOne] = array[arrayTwo];
    array[arrayTwo] = reset;
  }
  return array;
}
//--------- Get the list of names from DB to populate options
function getNames(req, res){
  const SQL = `SELECT * FROM dummy`;
  client.query(SQL)
    .then(data => {
      nameList = data.rows.map(name => name.speaker);
      buildQuiz(req, res);
    });
}
//-------- Builds the actual quiz object
function buildQuiz(req, res){
  quiz = (shuffleArray(questionArray.map(question => {
    let wrongAnswers = nameList;
    wrongAnswers = wrongAnswers.filter(name => name !== question.quoter ? true : false);
    wrongAnswers = (shuffleArray(wrongAnswers)).slice(0,3);
    wrongAnswers.push(question.quoter);
    let options = shuffleArray(wrongAnswers);
    return new QuizObject(question, options);
  }))).map((obj, i) => {
    obj.id = i;
    return obj;
  });
  res.status(200).render('quiz', {
    quote: quiz[0],
    player: playerName,
    score: score
  });
}
//---- check answer and goto next
function answerCheck(req, res){
  let questionID = req.params.id;
  if(req.body.answer === quiz[questionID].quoter){
    score++;
  }
  questionID++;
  if(questionID > 4){
    addScores(req, res);
  }else{
    res.status(200).render('quiz', {
      quote: quiz[questionID],
      player: playerName,
      score: score
    });
  }
}

//---------------------------------------------------------API CALLS
//------------------------------ Always Sunny API
function sunnyQuotes (req, res){
  let API = 'http://sunnyquotes.net/q.php?random';
  superagent.get(API)
    .then( data => {
      questionArray.push(new Sunny(data.body));
      breakingBadAPI(req, res);
    })
    .catch(error => error500(req, res, error));
}

//----------------------------- Breaking Bad API
function breakingBadAPI(req, res){
  const URL = `https://breaking-bad-quotes.herokuapp.com/v1/quotes`;
  superagent.get(URL)
    .then(data => {
      questionArray.push(new BadQuote(data.body[0]));
      officeAPI(req, res);
    })
    .catch(error => error500(req, res, error));
}

//----------------------------- Office API
function officeAPI(req, res){
  const URL = `https://officeapi.dev/api/quotes/random`;
  superagent.get(URL)
    .then(data => {
      questionArray.push(new Office((JSON.parse(data.text)).data));
      swansonAPI(req, res);
    })
    .catch(error => error500(req, res, error));
}

//--------------------------- Ron Swanson API
function swansonAPI(req, res){
  const URL = `https://ron-swanson-quotes.herokuapp.com/v2/quotes`;
  superagent.get(URL)
    .then(data => {
      questionArray.push(new Swanson(data.body[0]));
      kanyeAPI(req, res);
    })
    .catch(error => error500(req, res, error));
}
//------------------------------- Kanye API
function kanyeAPI(req, res){
  const URL = `https://api.kanye.rest`;
  superagent.get(URL)
    .then(data =>{
      questionArray.push(new Kanye(data.body.quote));
      getNames(req, res);
    })
    .catch(error => error500(req, res, error));
}

//-------------------------------------------------------- Constructors
function Sunny(newSunnyQuote){
  this.quote = newSunnyQuote.sqQuote;
  this.quoter = newSunnyQuote.sqWho;
}
function BadQuote(quote){
  this.quote = quote.quote;
  this.quoter = quote.author;
}
function Office(obj){
  this.quote = obj.content;
  let name = `${obj.character.firstname} ${obj.character.lastname}`;
  this.quoter = name;
}
function Swanson(quote){
  this.quote = quote;
  this.quoter = 'Ron Swanson';
}
function Kanye(quote){
  this.quote = quote;
  this.quoter = 'Kanye West';
}
function QuizObject(quote, options){
  this.quote = quote.quote;
  this.quoter = quote.quoter;
  this.optionA = options[0];
  this.optionB = options[1];
  this.optionC = options[2];
  this.optionD = options[3];
  this.image = 'https://place-hold.it/175x250';
}
function ScoreBoard(obj) {
  this.name = obj.firstname;
  this.score = obj.score_number;
  this.outOf = obj.out_of;
}

// DATABASE STUFF ----------------------------------------------------------

//--------------------------------- Add Quote
function addQuote(req, res) {
  const SQL = 'INSERT INTO quotes (quotes, quoter) VALUES ($1, $2) RETURNING id';
  const params = [req.body.quote, req.body.quoter];
  client.query(SQL, params)
    .then(() => {
      res.status(200);
    })
    .catch(error => error500(req, res, error));
}

//--------------------------------- Saved Quotes
function savedQuote(req, res) {
  const SQL = 'SELECT * FROM quotes;';

  return client.query(SQL)
    .then(results => {
      res.status(200).render('saved', { quizobject : results.rows });
    })
    .catch(error => error500(req, res, error));
}
//--------------------------------- Add Scores
function addScores(req, res) {
  const SQL = 'INSERT INTO users (firstName, score_number, out_of) VALUES ($1, $2, $3) RETURNING *';
  const params = [playerName, score, quiz.length];
  client.query(SQL, params)
    .then(() => {
      res.status(200).redirect(`/scores`);
    })
    .catch(error => error500(req, res, error));
}

//------------------------------ Get Saved Scores
function savedScores(req, res) {
  const SQL = 'SELECT * FROM users;';
  return client.query(SQL)
    .then(results => {
      let scores = results.rows.map(score => new ScoreBoard(score));
      res.status(200).render('scores', {scores: scores});
    })
    .catch(error => error500(req, res, error));
}

//--------------------------------- Add Notes
function addQuoteNote(req, res) {
  const SQL = 'UPDATE quotes SET note = $1 WHERE id=$2';
  const params = [req.body.note, req.body.id];
  console.log('saving the thing');
  client.query(SQL, params)
    .then(() => {
      res.status(200).redirect('saved');
    })
    .catch(error => error500(req, res, error));
}

//--------------------------------- Delete Quote
function deleteQuote(req, res) {
  const SQL = 'DELETE from quotes WHERE id = $1';
  const params = [req.body.id];
  client.query(SQL, params)
    .then(results => {
      console.log(results.rows);
      res.status(200).redirect('saved');
    })
    .catch(error => error500(req, res, error));
}

// ------------------------- Errors
function error404(req, res) {
  console.log('Error 404');
  const image = `https://http.cat/404.jpg`;
  res.status(404).render(`error`, {image: image});
}
function error500(req, res, error) {
  console.log('ERROR 500:', error);
  const image = `https://http.cat/500.jpg`;
  res.status(404).render(`error`, {image: image});
}

// turn the server on
client.connect()
  .then(()=> {
    app.listen(port, () => {
      console.log('its alive');
    });
  })
  .catch (error => {
    console.log(error);
  });
