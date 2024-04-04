FROM node:17

# workding dir 
WORKDIR /

# Copy the package.json and package-lock.json to the image
COPY package*.json ./ 

RUN npm install -g nodemon

RUN npm install prettier -g

# install packages 
RUN npm install

# add the source code to the image
COPY . .

# Expose the API Port
EXPOSE 1337

CMD ["npm","run","start"]
