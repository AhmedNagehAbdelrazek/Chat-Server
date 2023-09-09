const app = require("./app");
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({path:"./config.env"});

process.on('uncaughtException',(err)=>{
    console.log(err);
    process.exit(1);
});


const http = require("http");

const server = http.createServer(app);

const DB = process.env.DBURI.replace("<password>",process.env.MONGODBPASSWORD);

mongoose.connect(DB,{
    useNewUrlParser:true,
    useCreateIndex:true,
    useFindAndModify:false,
    useUnifiedTopology:true
}).then((con)=>{
    console.log("DB connection is successful");
}).catch((err)=>{
    console.log(err);
});

const port = process.env.PORT || 8000;

server.listen(port,()=>{
    console.log(`app is running on port ${port}`);
});


process.on('unhandledRejection',(err)=>{
    console.log(err);
    server.close(()=>{
        process.close(1);
    });
});