/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.teams.meeting.participants.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date:10/28/2025
 @Notes: This script fills the cmdb_teams_meeting_participant by reading the cmdb_teams_user_daily_activity
 table.

 PREREQ: This script expects there to be cmdb_teams* records already created and cmdb_program_usage_details
 for teams.

 CAVEAT:
 Here is the issue with this. The Teams usage data is created head of time using different scripts. This
 script picks a participant and tries to find a start and end time that matches the user's Teams usage in
 the program usge details table. However, the team meeting will have other particpants. Those users may
 not have the same matching usage. (with same begin/end times) But, hopefully that won't matter.

 RERUN: To rework this data, you need to clear out the cmdb_teams_meeting and cmdb_teams_meeting_particpant
 data and re-run.
=============================================================================================================*/

const cfg = {
    APPS        : ["teams.exe"],
    debug       : "None",
    msgCancel	: "The script has been manually cancelled...",
    update      : true
};

const rpt = {    
    err         : "None",
    created     : 0,
    failed      : 0
};

let UK = [], US = [], IND = [], AUS = [], UND = [];

let run = function() {

    UK  = getOfficeIds(["London Office"]);
    US  = getOfficeIds(["Atlanta Office", "San Francisco Office"]);
    IND = getOfficeIds(["Baya Park", "Grande Palladium"]);
    AUS = getOfficeIds(["Newcastle Office", "Wollongong Office"]);
    UND = getOfficeIds(["Undefined Location"]);    

    let crits = new java.util.ArrayList();
    crits.add(GT("tdu.teams_meeting_count", 0));
    crits.add(GT("tdu.other_meeting_count", 0));
    crits.add(GT("tdu.other_external_meeting_count", 0));

    let cols = new java.util.ArrayList();
    cols.add(Query.column("tdu.user", "user")); 
    cols.add(Query.column("tdu.date", "date"));   
    cols.add(Query.column("c.id", "computer"));
    cols.add(Query.column("tu.id", "teams_user")); // Meeting Owner

    // Loop through daily activity to create participants
    let q = Query.select(cols);
    q.from("cmdb_teams_user_daily_activity", "tdu");
    q.join("cmdb_teams_user", "tu", "tu.user", "tdu.user");
    q.join("cmdb_ci_computer", "c", "c.primary_user", "tdu.user");    
    q.where(OR(crits)); 

    let tdu = this.exec.executeLM(q);    
    let totLength = tdu.length;
            
     for (let x = 0; x < totLength; x++) {

        if (jobHandle.isStopped()) throw "Cancelled...";

        let du = tdu[x];
        let user = du["user"];
        let usageDate = du["date"];
        let computer = du["computer"];
        let locName = getUserLocationGroup(user);
        let location = getRandomWorkLocation(locName);
        let teamsUser = du["teams_user"];
            
        // Create a cmdb_teams_meeting with a fake meeting ID
        let entityMeet = this.mgr.create("cmdb_teams_meeting");
        entityMeet.set("meeting_id", this.generateGUID());
        entityMeet.save();
        let meetingId = entityMeet.get("id");

        let PARTICIPANTS = [], participant = {};

        /* Let's get some start/end times for teamsUser. It's possible that there is no teams usage details 
           for this particular user on that day. Teams Daily Activity was created before program
           usage details, independently. There will be some gaps. */
        let timeBlocks = getTimeBlocks(usageDate, teamsUser);
        if (!timeBlocks.start) {
            rpt.failed++;
            continue;
        }       

        /* We need participants, so pick another user(s) and/or external user which has no cmn_user record, just GUID.
           So, let's pick 2-4 users in each meeting. The random users may have not program usage details, but that may 
           not really matter for demo. */
        let loop = this.rand(2,4,0);
        for (let i = 1; i <= loop; i++) {

            if (jobHandle.isStopped()) throw "Cancelled...";
            let entityPart = this.mgr.create("cmdb_teams_meeting_participant");
            entityPart.set("meeting", meetingId);            
            
            if (i==1) {
                participant.id = teamsUser;
                participant.computer = computer;
                participant.location = location;
            } else if (i==2 || i==3) {
                participant = getRandomUser(true, PARTICIPANTS);
            } else {
                // Pick another random cmdb_teams_user (maybe external)
                participant = getRandomUser(false, PARTICIPANTS);
            }

            PARTICIPANTS.push(participant.id);
            entityPart.set("participant", participant.id);
            entityPart.set("begin_time", timeBlocks.start);
            entityPart.set("end_time", timeBlocks.end);                   
            entityPart.set("computer", participant.computer);
            entityPart.set("location", participant.location);
                        
            if (cfg.update) entityPart.save();
            rpt.created++;               
        }     

        let percentage = ((x / totLength) * 100.0);
        jobState.onProgress(percentage, "Processing record " + x + " of " + totLength);
    }
};

// For the given date and user, we need teams usage (start and end times)
let getTimeBlocks = function (usageDate, teamsUser) {

    let startTime = null, endTime = null;

    let cols = new java.util.ArrayList();
    cols.add(Query.column("pud.start_time", "start"));
    cols.add(Query.column("pud.end_time", "end"));

    let crits = new java.util.ArrayList();
    crits.add(EQ("tu.id", teamsUser));
    crits.add(EQ("pud.usage_date", usageDate)); 
    crits.add(IN("p.file_name", cfg.APPS));   

    let q = Query.select(cols);
    q.from("cmdb_program_usage_details", "pud");
    q.join("cmdb_program_instance", "pid", "pid.id", "pud.program_instance");
    q.join("cmdb_program", "p", "p.id", "pid.program");
    q.join("cmdb_teams_user", "tu", "tu.user", "pud.user");
    q.where(AND(crits));
    q.limit(1);    
    let usages = this.exec.executeLM(q);    
    
    if (usages.length > 0) {
        usage = usages[0];
        startTime = usage["start"];
        endTime = usage["end"];
    }

    return {
        start: startTime,
        end: endTime
    }; 
};

// Don't pick duplicate participants. Make sure each
// user has teams usage. (I verified manually)
let getRandomUser = function(internal, PARTICIPANTS) {
 
    let computer = null; location = null;
    let participantFound = false;
    let user = null;

    while (!participantFound) {

        id = getTeamsUser(true);

        if (jobHandle.isStopped()) throw "Cancelled...";
        let cols = new java.util.ArrayList();
        cols.add(Query.column("tu.id", "id"));
        if (internal) {
            cols.add(Query.column("c.id", "computer"));
            cols.add(Query.column("p.id", "person"));            
            cols.add(Query.column("g.name", "location"));    
        }

        let crits = new java.util.ArrayList();
        crits.add(EQ("tu.id", id));
        crits.add(NOT_IN("tu.id", PARTICIPANTS));
        if (internal) crits.add(EQ("t.name", "Location"));

        let q = Query.select(cols);
        q.from("cmdb_teams_user", "tu");
        if (internal) {
            q.join("cmdb_ci_computer", "c", "c.primary_user", "tu.user");
            q.join("cmn_user", "u", "u.id", "tu.user");   
            q.join("cmn_person", "p", "p.id", "u.person");   
            q.join("acu_group_person", "gp", "gp.person", "p.id");
            q.join("acu_group", "g", "g.id", "gp.group");
            q.join("acu_group_type", "t", "t.id", "g.type");  
        }   
        q.where(AND(crits));
        q.limit(1);
        let participants = this.exec.executeLM(q);    
        if (participants.length > 0) {
            participantFound = true;
            participant = participants[0];
            if (internal) {
                computer = participant["computer"];
                location = getRandomWorkLocation(participant["location"]);
            }
        }
    }

    return {
        id: participant["id"],
        computer: computer,
        location: location
    };        
};

let getOfficeIds = function(offices) {

    let q = Query.select(java.util.Arrays.asList(Query.column("l.id", "id")));
    q.from("cmn_location", "l");
    q.where(IN("name", offices));
    return this.exec.executeL1(q);
};

// Get a random teams user
let getTeamsUser = function(internal) {

    let crit = null;
    if (internal)
        crit = NE("user", null);
    else 
        crit = EQ("user", null);

    let q = Query.select(java.util.Arrays.asList(Query.column("t.id", "id")));
    q.from("cmdb_teams_user", "t");
    q.where(crit);
    let users = this.exec.executeL1(q);
    let user = users[this.rand(0, users.length-1)];
    return user;
};

let getUserLocationGroup = function(user) {
      
    let crits = new java.util.ArrayList();
    crits.add(EQ("u.id", user));
    crits.add(EQ("t.name", "Location"));

    let q = Query.select(java.util.Arrays.asList(Query.column("g.name", "name")));
    q.from("cmn_user", "u");
    q.join("cmn_person", "p", "p.id", "u.person");   
    q.join("acu_group_person", "gp", "gp.person", "p.id");
    q.join("acu_group", "g", "g.id", "gp.group");
    q.join("acu_group_type", "t", "t.id", "g.type"); 
    q.where(AND(crits));
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

/* ----------------------------------------------------------------------------------------------------------------

 STARTING POINT

---------------------------------------------------------------------------------------------------------------- */ 
try {
  
	if (!jobHandle.isStopped()) {
		run();    
	} else {
		rpt.err = cfg.msgCancel;
	}     
  
} catch (e) {
  
	rpt.err = e;
  
} finally {
  
	let result = String.format("Records created: {0}, no prog usage: {1}, last error: {2}, update flag = {3}, debug={4}", 
		rpt.created,
        rpt.failed,
		rpt.err,
		cfg.update,
		cfg.debug);

	jobState.onProgress(100.0, result);			
};