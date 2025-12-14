/*
      ssi.datasim.emp.journey.event.refersher
*/

include("ssi.utils.js");

let cnt = 0;

let entities = mgr.readAllLazily("ds_emp_journey_web_page_event_staging");

while (entities.hasNext()) {

	if (jobHandle.isStopped()) throw "Manual script cancellation...";       
	let entity = entities.next();
	let computer = entity.get("computer");
	let duration = entity.get("duration");
	let eventDefinition = entity.get("event_definition");
	let location = entity.get("location");
	let timestamp = entity.get("timestamp");
	let offset = entity.get("offset");
	let user = entity.get("user");	  
        let tag = entity.get("tag");
	
	// The offset makes sure that not all webevents are created on the same day
	let curDate = new java.util.Date();	
	curDate.setDate(curDate.getDate() - offset);	
	let Calendar = java.util.Calendar;
	let cal = Calendar.getInstance();
	cal.setTime(curDate);
	cal.set(Calendar.HOUR_OF_DAY, timestamp.getHours());
	cal.set(Calendar.MINUTE, timestamp.getMinutes());
	cal.set(Calendar.SECOND, 00);	
	let newTimeStamp = cal.getTime();
	
let ev = null;
    
if (tag == "L1") {
   ev = 119;    
} else if (tag =="Mortgages") {
   ev = 114;        
} else {
   ev = getField("cmdb_web_page_event_definition", "id", "name", eventDefinition);
}    
    
	let rec = mgr.create("cmdb_web_page_event");
	rec.set("computer", getField("cmdb_ci_computer", "id", "name", computer));
	rec.set("duration", duration);
	rec.set("event_definition", ev);
	rec.set("location", getField("cmn_location", "id", "name", location));
	rec.set("timestamp", newTimeStamp);
	rec.set("user", getField("cmn_user", "id", "user_name", user));
    	rec.save();
	cnt++;   
}

cnt;