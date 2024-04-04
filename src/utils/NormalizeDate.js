function NormalizeTime(time){
    return(`${time.getHours()%12}:${time.getMinutes()} ${time.getHours() > 12 ? "PM":"AM"}`)
}

module.exports = NormalizeTime;