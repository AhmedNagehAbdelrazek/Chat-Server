exports.getType = (type)=> {
    if(type === null || type === undefined ||  typeof type !== "string" || type === "" || type.length < 3){
      return null;
    }
    let type_output = "direct" | "group";
    type = type.toLowerCase();
    if("direct".search(type) === 0){
      type_output = "direct";
      return type_output;
    }
    if("group".search(type) === 0){
      type_output = "group";
      return type_output;
    }
}
