/*============================================================================================================
 @Script: ssi.utils.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 3/27/2024
=============================================================================================================*/

/* --------------------------------------------------------
	Database Constants
 -------------------------------------------------------- */

const mgr = dbApi.getEntityManager();
const exec = dbApi.getQueryExecutor();

const AND = Criterion.AND;
const BETWEEN = Criterion.BETWEEN;
const EQ = Criterion.EQ;
const GT = Criterion.GT;
const GE = Criterion.GE;
const ILIKE = Criterion.ILIKE;
const IN = Criterion.IN;
const LIKE = Criterion.LIKE;
const NE = Criterion.NE;
const NOT_IN = Criterion.NOT_IN;
const OR = Criterion.OR;


/* --------------------------------------------------------
	Handy little batch deleter.
 -------------------------------------------------------- */
let batchDeleter = function(table, criteria) {
		
	let recsDeleted = 0;
	let deleter = dbApi.createBatchDelete(table);
	
	if (!criteria) {
		recsDeleted = deleter.deleteAll();	
	} else {
		recsDeleted = deleter.delete_(AND(criteria));
	}
	
	return recsDeleted;
};


/* --------------------------------------------------------
	Returns the difference between two dates
 -------------------------------------------------------- */
let getDateDiff = function(date1, date2) {

	let days = null;
	if (date1 != null && date2 != null) {
		let one = new Date(date1.getYear(), date1.getMonth(), date1.getDate());
		let two = new Date(date2.getYear(), date2.getMonth(), date2.getDate());

		// Do the math.
		let millisecondsPerDay = 1000 * 60 * 60 * 24;
		let millisBetween = two.getTime() - one.getTime();
		days = Math.floor(millisBetween / millisecondsPerDay);
	}

	return days;
};


/* --------------------------------------------------------
	Build a calendar date object.
 -------------------------------------------------------- */
let buildDate = function(curDate, hour, min, sec) {
      
      let Calendar = java.util.Calendar;
      let cal = Calendar.getInstance();
      cal.setTime(curDate);
      cal.set(Calendar.HOUR_OF_DAY, hour);
      cal.set(Calendar.MINUTE, min);
      cal.set(Calendar.SECOND, sec);     
      return cal.getTime();      
};


/* --------------------------------------------------------
	Add hours to a date. Useful for timestamps.
 -------------------------------------------------------- */
let addHours = function(date, hours) {
      
      date.setTime(date.getTime() + hours * 60 * 60 * 1000);
      return date;

};


/* --------------------------------------------------------
	Chk if we are excluding weekends and this day is a weekend
 -------------------------------------------------------- */
let excludedDay = function(dt, excludeWeekends) {
           
      let exclude = false;
      
      if (excludeWeekends && (dt.getDay() === 6 || (dt.getDay() === 0)))
            exclude = true;
      
      return exclude ;
};


/* --------------------------------------------------------
	Is the current date a weekend?
 -------------------------------------------------------- */
let isWeekend = function(dt) {

      let retVal = false;
      if (dt.getDay() === 6 || (dt.getDay() === 0))
            retVal = true;
      return retVal;
};


/* --------------------------------------------------------
	Returns a summary usage period based on days
 -------------------------------------------------------- */
let getUsagePeriod = function(days, throwException) {

	let q = Query.select(Query.column("id"));
	q.from("cmdb_usage_period");
	q.where(EQ("days", days));		
	let period = this.exec.execute1(q);		
	if (!period) throw "Usage period for " + days + " days was not found...";	
	return period;
};


/* --------------------------------------------------------
	Get current milliseconds for timing purposes.
 -------------------------------------------------------- */
let getCurrentMillis = function() {

   return (new java.util.Date()).getTime();
};


/* --------------------------------------------------------
	Get product name.
 -------------------------------------------------------- */
let getProductName = function(id) {

   let name = null;
   let entity = this.mgr.readEntity("cmdb_software_product", EQ("id", id));
   if (entity) name = entity.get("name");   
   return name;
};


/* --------------------------------------------------------
	Get product Id.
 -------------------------------------------------------- */
let getProductId = function(name) {

   let id = null;
   let entity = this.mgr.readEntity("cmdb_software_product", EQ("name", name));
   if (entity) id = entity.get("id");   
   return id;
};


/* --------------------------------------------------------
	Get field.
 -------------------------------------------------------- */
let getField = function(table, column, critColumn, critValue) {

   let field = null;
   let entity = this.mgr.readEntity(table, EQ(critColumn, critValue));
   if (entity) field = entity.get(column);   
   return field;
};


let getSyncSource = function(name) {

	let id = null;
	let entity = this.mgr.readEntity("sys_sync_source", EQ("name", name));
	if (entity) id = entity.get("id");
	return id;	
};


let getTableCount = function(table) {
	
	let count = this.mgr.query(table).count();
	return count;
};

/* --------------------------------------------------------
	Set the script job progress
 -------------------------------------------------------- */
let setJobProgress = function(interval, counter, limit, label, other) {
			
	if ((counter % interval) ==  0) {				
		let percentage = ((counter / limit) * 100.0);
		jobState.onProgress(percentage, 
			String.format("{0} out of {1} {2} created. {3}", 
				counter,
				limit,
				label,
                        other));
	}
};


/* --------------------------------------------------------
	Exception handling
 -------------------------------------------------------- */
let hasCause = function(e, cause) {
   
   while (e && e != e.getCause()) {
      if (e.getClass().getName() == cause) {
         return true;
      }
      e = e.getCause();
   }
   
   return false;
};


let isDatabaseException = function(e) {
   
   return hasCause(e, "com.scalable.live.db.exception.DBException");
};

/* --------------------------------------------------------
	Random data using normal distribution
 -------------------------------------------------------- */
// See https://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve
const randn_bm = function(min, max, skew) {
      
    var u = 0, v = 0;
    while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );

    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) {
          num = randn_bm(min, max, skew); // resample between 0 and 1 if out of range
    }
    else {
          num = Math.pow(num, skew); // Skew
          num *= max - min; // Stretch to fill range
          num += min; // offset to min
    }
    
    return num;
};


/* --------------------------------------------------------
	A javascript version of string.format
 -------------------------------------------------------- */
if (!String.format) {
  
  String.format = function(format) {
    let args = [].slice.call(arguments, 1);
		return format.replace(/{(\d+)}/g, function(match, number) { 
			return typeof args[number] != 'undefined' ? args[number] : match;
		});
  };
};


/* --------------------------------------------------------
	Convert an IP to a long.
 -------------------------------------------------------- */
let ip2int = function(ip) {
    return ip.split('.').reduce(function(ipInt, octet) { return (ipInt<<8) + parseInt(octet, 10)}, 0) >>> 0;
};

// Add up numbers in array
Array.prototype.getSum = function () {

      let sum = 0;
      for (let i = 0; i < this.length; i++) {
            if (!isNaN(this[i]))
                  sum += parseInt(this[i]);
      }
      return sum;
     
};

// Generate random numbers with a skew
let rand = function(min, max, skew) {
  
      let rnd = Math.random();   // random number from [0.0..1.0)
      if (skew) rnd = rnd * rnd; // skew towards zero, with smaller values being more likely to occur
      return Math.floor(min + rnd * ((max+1) - min));
};

// Return byte array for usetime and runtime
Array.prototype.getBytes = function () {
      
      let stream = new java.io.ByteArrayOutputStream();
      for (let i = 0; i < this.length; ++i) {
            stream.write(this[i]);
      }
      
      return stream.toByteArray();

};

// Generate a random GUID
let generateGUID = function() {
    
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}