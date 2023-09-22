const express = require("express");  //web framework for node.js

const morgan = require("morgan");   

const rateLimit = require("express-rate-limit");

const helmet = require("helmet");

const mongosanitize = require("express-mongo-sanitize");

const bodyParser = require("body-parser");

const xss = require("xss-clean");

const cors = require("cors");

const routes = require('./Routes/index');



const app = express();

app.use(cors({
    origin:"*",
    methods:["GET","PATCH","PUT","POST","DELETE"],
    credentials:true,
    
}));

app.use(express.json({limit:"10kb"}));
app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));


if(process.env.NODE_ENV === 'development'){
    app.use(morgan);
}

const limiter = rateLimit({
    max:3000,
    windowMs: 60 * 60 * 1000, // in one hour
    message:"Too many requests from this IP, Please Try Again Later"
});

app.use("/WhatsAppClone",limiter);

app.use(
    express.urlencoded({
      extended: true,
    })
  );

app.use(mongosanitize());

app.use(xss());

app.use(routes);

module.exports = app;



