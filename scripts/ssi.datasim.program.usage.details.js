/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.program.usage.details.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date:10/28/2025
 @Notes: This script takes daily usage and creates program usage detail. Note: as of writing this code, the
 data genreated by this script will not perfectly match with daily usage's useTime or the hours in program 
 hourly usage table. Also, this scripts works with existing Location groups. So if this gets run on a
 different instance, you will need to change the office locations around line 35 and also update
 getRandomWorkLocation().

 TO RERUN: This is a run-once script. If you need to recreate the data, remove it first from program usage 
 details. 
=============================================================================================================*/

const cfg = {
    APPS        : ["teams.exe"],
    debug       : "None",
    start       : "8/24/2025",
    end         : "10/23/2025",
    startHour   : 7,
    endHour     : 18,
    update      : true
};

const rpt = {
    err         : "None",
    created     : 0,
    totRecs     : 0
};

let UK = [], US = [], IND = [], AUS = [], UND = [];

let run = function() {

    let startDate = new java.util.Date(cfg.start);
    let endDate = new java.util.Date(cfg.end);    

    // Load up the work locations
    UK  = getOfficeIds(["London Office"]);
    US  = getOfficeIds(["Atlanta Office", "San Francisco Office"]);
    IND = getOfficeIds(["Baya Park", "Grande Palladium"]);
    AUS = getOfficeIds(["Newcastle Office", "Wollongong Office"]);
    UND = getOfficeIds(["Undefined Location"]);

    let cols = new java.util.ArrayList();
    cols.add(Query.column("du.usage_date", "usage_date"));
    cols.add(Query.column("du.used_from", "used_from"));
    cols.add(Query.column("pi.installed_on", "computer"));
    cols.add(Query.column("du.user", "user"));
    cols.add(Query.column("du.day_of_week", "day_of_week"));
    cols.add(Query.column("du.minutes_in_use", "minutes_in_use"));
    cols.add(Query.column("du.keystrokes", "keystrokes"));
    cols.add(Query.column("du.mouse_clicks", "mouse_clicks"));
    cols.add(Query.column("du.program_instance", "program_instance")); 
    cols.add(Query.column("du.thin_client", "thin_client"));
    cols.add(Query.column("u.person", "person"));               

    let q = Query.select(cols);
    q.from("cmdb_program_daily_usage", "du");  
    q.join("cmdb_program_instance", "pi", "pi.id", "du.program_instance");
    q.join("cmdb_program", "p", "p.id", "pi.program");
    q.join("cmn_user", "u", "u.id", "du.user");
    q.leftJoin("cmn_person", "per", "per.id", "u.person"); // make sure it has a person
    q.where(AND(IN("p.file_name", cfg.APPS), BETWEEN("du.usage_date", startDate, endDate)));
    let usages = this.exec.executeLM(q);    
    rpt.totalRecs = usages.length;
            
     for (let i = 0; i < usages.length; i++) {

        if (jobHandle.isStopped()) throw "Cancelled...";

        let usage = usages[i];
        let usageDate = usage["usage_date"];
        let computer = usage["computer"];
        let usedFrom = usage["used_from"];
        let user = usage["user"];
        let dayOfWeek = usage["day_of_week"];
        let minutesInUse = usage["minutes_in_use"];
        let keystrokes = usage["keystrokes"];
        let mouseClicks = usage["mouse_clicks"];
        let programInstance = usage["program_instance"];
        let thinClient = usage["thin_client"];
        let person = usage["person"];
        let locationGroup = getGroupName("location", person);
        let workLocation = getRandomWorkLocation(locationGroup);

        // Determine how to split the minutes in use into several prg usage detail recs
        let minutesSplit = splitNumberRandomly(minutesInUse);
        let usageRecordSplitCount = minutesSplit.length;
        let keysSplit = splitNumberRandomlyXWays(keystrokes, usageRecordSplitCount);
        let mouseSplit = splitNumberRandomlyXWays(mouseClicks, usageRecordSplitCount);
        let lastEndTime = null;

        // Each split in daily usage represents opening and closing an app with same day
        for (let x = 0; x < usageRecordSplitCount; x++) {
        
            if (jobHandle.isStopped()) throw "Cancelled...";

            let programUsageDetails = this.mgr.create("cmdb_program_usage_details");
            programUsageDetails.set("computer", computer);
            programUsageDetails.set("used_from", usedFrom);
            programUsageDetails.set("usage_date", usageDate);
            programUsageDetails.set("user", user);
            programUsageDetails.set("day_of_week", dayOfWeek);
            programUsageDetails.set("program_instance", programInstance);
            programUsageDetails.set("thin_client", thinClient);
            programUsageDetails.set("keystrokes", keysSplit[x]);
            programUsageDetails.set("mouse_clicks", mouseSplit[x]);
            let timeBlocks = generateTimeBlocks(usageDate, cfg.startHour, cfg.endHour, minutesSplit[x], lastEndTime);
            programUsageDetails.set("start_time", timeBlocks.start);
            programUsageDetails.set("end_time", timeBlocks.end);
            programUsageDetails.set("duration_seconds", timeBlocks.duration);
            lastEndTime = timeBlocks.end;
                        
            // every once in a while, change location for the same user at start or end of day. (1 in 20 chance)
            if (x==0 || x== (usageRecordSplitCount-1)) {
                if (Math.floor(Math.random() * 20) === 0) workLocation = getRandomWorkLocation(locationGroup);
                programUsageDetails.set("location", workLocation);
            }
            if (cfg.update) programUsageDetails.save();
            rpt.created++;
        }

        let percentage = ((i / rpt.totalRecs) * 100.0);
        jobState.onProgress(percentage, "Processing daily usage record " + i + " of " + rpt.totalRecs);
    }
};

// Return the name of the user's location group
let getGroupName = function(type, person) {

      let crits = new java.util.ArrayList();
      crits.add(EQ("gp.person", person));
      crits.add(ILIKE("t.name", type));

      let q = Query.select(java.util.Arrays.asList(Query.column("g.name", "name")));
      q.from("acu_group_person", "gp");
      q.join("acu_group", "g", "g.id", "gp.group");
      q.join("acu_group_type", "t", "t.id", "g.type");
      q.where(AND(crits));
      q.limit(1);
      return this.exec.execute1(q);
      
};

// Return a random work location record ID within user's area
let getRandomWorkLocation = function(location) {

    let locationId = null;

    switch (location) {
        case "US" :
            locationId = US[this.rand(0, US.length-1)];
            break;
        case "UK" :
            locationId = UK[this.rand(0, UK.length-1)];
            break;
        case "India" :
            locationId = IND[this.rand(0, IND.length-1)];
            break;
        case "Australia" :
            locationId = AUS[this.rand(0, AUS.length-1)];
            break;
        default :
            locationId = UND[this.rand(0, UND.length-1)];
    }

    return locationId;
};

let getOfficeIds = function(offices) {

    let q = Query.select(java.util.Arrays.asList(Query.column("l.id", "id")));
    q.from("cmn_location", "l");
    q.where(IN("name", offices));
    return this.exec.executeL1(q);
};

// Take number (i.e. minutes in use) and split into X ways depending on number size
let splitNumberRandomly = function(n) {
    
    var parts = [];

    if (n > 60) {

        // Split into 3 parts
        var a = Math.floor(Math.random() * (n - 2)) + 1;
        var b = Math.floor(Math.random() * (n - a - 1)) + 1;
        var c = n - a - b;
        parts = [a, b, c];

    } else if (n > 30) {

        // Split into 2 parts
        var a = Math.floor(Math.random() * (n - 1)) + 1;
        var b = n - a;
        parts = [a, b];
    
    } else {
        
        // No split
        parts = [n];
    }

    return parts;
};

// Split a number X ways by a specified split count
let splitNumberRandomlyXWays = function(n, splitCount) {

    if (splitCount < 1 || splitCount > n) {
        return [n]; // fallback: no split or invalid request
    }

    var parts = [];
    var remaining = n;

    for (var i = 0; i < splitCount - 1; i++) {
        // Ensure each part is at least 1
        var max = remaining - (splitCount - i - 1);
        var value = Math.floor(Math.random() * (max - 1)) + 1;
        parts.push(value);
        remaining -= value;
    }

    parts.push(remaining); // final part to complete the sum
    return parts;
};

// Get a set of start and end times based on minutes/duration input. Each date
// must be older than the afterDate and it can handle null afterDate.
let generateTimeBlocks = function(dateStr, startHour, endHour, minMinutes, afterDate) {

    let Calendar = java.util.Calendar;
    let baseDate = dateStr;

    let startCal = Calendar.getInstance();
    startCal.setTime(baseDate);
    startCal.set(Calendar.HOUR_OF_DAY, startHour);
    startCal.set(Calendar.MINUTE, 0);
    startCal.set(Calendar.SECOND, 0);

    let endCal = Calendar.getInstance();
    endCal.setTime(baseDate);
    endCal.set(Calendar.HOUR_OF_DAY, endHour);
    endCal.set(Calendar.MINUTE, 0);
    endCal.set(Calendar.SECOND, 0);

    let startMillis;
    if (afterDate == null) {
        let offsetMinutes = Math.floor(Math.random() * 121); // 0–120 minutes
        startMillis = startCal.getTimeInMillis() + offsetMinutes * 60000;
    } else {
        let bufferMinutes = Math.floor(Math.random() * 16) + 15; // 15–30 minutes
        startMillis = afterDate.getTime() + bufferMinutes * 60000;
        startMillis = Math.max(startMillis, startCal.getTimeInMillis());
    }

    let endMillis = endCal.getTimeInMillis();
    let availableMinutes = Math.floor((endMillis - startMillis) / 60000);

    if (availableMinutes < minMinutes) {
        return null; // not enough time left
    }

    // Ensure duration is exactly minMinutes
    let calStart = Calendar.getInstance();
    calStart.setTime(new java.util.Date(startMillis));

    let calEnd = Calendar.getInstance();
    calEnd.setTime(new java.util.Date(startMillis + minMinutes * 60000));

    return {
        start: calStart.getTime(),
        end: calEnd.getTime(),
        duration: minMinutes * 60 // in seconds
    };
};


/* ----------------------------------------------------------------------------------------------------------------

 STARTING POINT

---------------------------------------------------------------------------------------------------------------- */ 
try {
  
	if (!jobHandle.isStopped()) {
		run();    
	} else {
		rpt.err = "The script has been cancelled manually...";
	}     
  
} catch (e) {
  
	rpt.err = e;
  
} finally {
  
	let result = String.format("Detail records created: {0} from {1} daily usage records, last error: {2}, update flag = {3}, debug={4}", 
		rpt.created,
        rpt.totalRecs,
		rpt.err,
		cfg.update,
		cfg.debug);

	jobState.onProgress(100.0, result);			
};