/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.meeting.events.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 1/28/2025
 @Notes: Create teams and exchange data. This is a one-time script run. If you run it twice, it will create
 duplicates. If you need to run this again, delete records in cmdb_teams_user_summary_activity. It 
 will also clear out the daily table. If the user doesn't have the software installed, it will not get
 included in the initial person query. (i.e. it joins with program instance)
=============================================================================================================*/

const cfg = {
    debug           : "None",
    msgCancel       : "The script has been manually cancelled...",
    percInactive    : 10, // % of daily records that will be inactive
    skipWknds       : false,
    weekendPerc     : 2, // % of small weekend usage allowed
    update          : true
};

const rpt = {
    err             : "None",
    totDailyRecs    : 0,
    totSummaryRecs  : 0
};

const types = {
    teams       : 0,
    exch        : 1
};

const sd = "1/21/2024";
const ed = "3/21/2024";

// Don't change these two consts
const PROGRAMS = ["teams.exe", "outlook.exe"];
const TABLES =   ["cmdb_teams_user_daily_activity", "cmdb_exchange_user_daily_activity"]
const SUMMARY =  ["cmdb_teams_user_summary_activity", "cmdb_exchange_user_summary_activity"];
const DURATIONS = [30, 60];

const periodWeek = this.getField("cmdb_usage_period", "id", "name", "Week");    

let run = function() {

    let startDate = new java.util.Date(sd);
    let endDate = new java.util.Date(ed);

    for (let p = 0; p < PROGRAMS.length; p++) {
    
        // Read in all persons that have the current program installed
        jobState.onProgress(1.0, "Running query to read person data...");		
        let q = Query.select(java.util.Arrays.asList(Query.column("u.id", "user")));
        q.from("cmn_person", "p");
        q.join("cmn_user", "u", "u.person", "p.id");
        q.join("cmdb_ci_computer", "c", "c.primary_user", "u.id");
        q.join("cmdb_program_instance", "pi", "pi.installed_on", "c.id");
        q.join("cmdb_program", "pr", "pr.id", "pi.program");
        q.where(AND(EQ("pi.operational", true), EQ("pr.file_name", PROGRAMS[p])));
        q.orderBy("p.id", Order.ASC)
        let persons = this.exec.executeLM(q);    

        // Loop through the days in the date range
        let days = getDateDiff(startDate, endDate) + 1;            
        for (let d = 0; d < days; d++) {
                   
            let curDate = new java.util.Date(startDate);
            curDate.setDate(curDate.getDate() + d);                  
                
            let percentage = ((d / days) * 100.0);
            jobState.onProgress(percentage, String.format("Processing day {0} for program {1}...",
                curDate, PROGRAMS[p]
            ));
                            
            // Loop through the # of persons with the current program
            for (let i = 0; i < persons.length; i++) {

                let inactive = false;
                let isWknd = this.isWeekend(curDate);
                if (isWknd) {
                    if (cfg.skipWknds) inactive = true;

                    // If it is weekend, let's only allow small % of usage
                    if (this.rand(1, 100, 0) <= (100-cfg.weekendPerc)) inactive = true;
                } 

                if (jobHandle.isStopped()) throw cfg.msgCancel;                                              

                // Create some inactivity              
                if (this.rand(1, 100, 0) >= (100-cfg.percInactive)) inactive = true;                

                let person = persons[i];                        
                let user = person["user"];
                let filesUploaded = (this.rand(1,50,0) == 1) ? 1 : 0;

                let entity = this.mgr.create(TABLES[p]);
                entity.set("user", user);
                entity.set("active", (!inactive) ? true : false);
                entity.set("date", curDate);
                entity.set("files_uploaded", (!inactive) ? filesUploaded : 0);
                
                // If inactive, just allow blank record to be created
                if (!inactive) {
                    if (p == types.teams) {

                        let otmc = (!isWknd) ? this.rand(0,3,0) : 0;
                        let otmd = (!isWknd) ? getDuration(otmc) : 0;
                        let omt = (!isWknd) ? this.rand(0,2,0) : 0;
                        let omtd = (!isWknd) ? getDuration(omt) : 0;
                        let temc = (!isWknd) ? this.rand(0,3,0) : 0;
                        let temd = (!isWknd) ? getDuration(temc) : 0;
                        let tmc = (!isWknd) ? this.rand(0,3,0) : 0;
                        let tmd = (!isWknd) ? getDuration(tmc) : 0;

                        entity.set("call_count", (!isWknd) ? this.rand(0,5,0) : this.rand(0,1,0));
                        entity.set("meeting_count", (!isWknd) ? this.rand(0,7,0) : 0);
                        entity.set("other_external_meeting_count", otmc);
                        entity.set("other_external_meeting_duration", otmd);
                        entity.set("other_meeting_count", omt);
                        entity.set("other_meeting_duration", omtd);
                        entity.set("private_chat_count", (!isWknd) ? this.rand(1,50,0) : this.rand(0,2,0));
                        entity.set("team_chat_count", (!isWknd) ? this.rand(1,8,0) : 0);
                        entity.set("teams_external_meeting_count", temc);
                        entity.set("teams_external_meeting_duration", temd);
                        entity.set("teams_meeting_count", tmc);
                        entity.set("teams_meeting_duration", tmd);

                    } else {

                        let rim = (!isWknd) ? this.rand(0,59,0) : this.rand(0,5,0);
                        let riu = (rim != 0) ? this.rand(1,50,0) : 0;
                        let rom = (!isWknd) ? this.rand(0,30,0) : this.rand(0,2,0);
                        let rou = (rom != 0) ? this.rand(1,30,0) : 0;
                        let sim = (!isWknd) ? this.rand(0,50,0) : this.rand(0,5,0);
                        let siu = (sim != 0) ? this.rand(1,50,0) : 0; 
                        let som = (!isWknd) ? this.rand(0,20,0) : this.rand(0,2,0);
                        let sou = (som != 0) ? this.rand(1,20,0) : 0; 
                        let ts = this.buildDate(curDate, this.rand(12, 18, 0), this.rand(0, 59, 0), this.rand(0, 59, 0));  

                        entity.set("conversations", (!isWknd) ? this.rand(1,50,0) : this.rand(0,5,0));
                        entity.set("last_message_timestamp", ts);
                        entity.set("received_inside_messages", rim);
                        entity.set("received_inside_users", riu);
                        entity.set("received_outside_messages", rom);
                        entity.set("received_outside_users", rou);
                        entity.set("sent_inside_messages", sim);
                        entity.set("sent_inside_users", siu);
                        entity.set("sent_outside_messages", som);
                        entity.set("sent_outside_users", sou);
                    }
                }
                
                if (cfg.update) entity.save();

                rpt.totDailyRecs++;
            }
        }
        
        // Now create summary records for the current program
        jobState.onProgress(99.0, String.format("Generating summary data for {0}. Total recs created: {1}...",
            PROGRAMS[p], rpt.totDailyRecs));
        createSummary(p);
    }    
};


/* ------------------------------------------------------------------------------------------
 Loop through all daily activity for a user and summarize it to a given week.
------------------------------------------------------------------------------------------ */
let createSummary = function(type) {

    let table = SUMMARY[type];
    let duq = Query.selectDistinct(java.util.Arrays.asList(Query.column("d.user")));
    duq.from(TABLES[type], "d");
    let users = this.exec.executeL1(duq);

    // Loop through distinct users with daily activity
    for (let u = 0; u < users.length; u++) {
        
        let user = users[u];
        let startDate = getMinOrMaxDate(user, 0, type);
        let endDate = getMinOrMaxDate(user, 1, type);
        
        // Loop through each day of teams/exchange activity for current user
        let periods = getPeriods(startDate, endDate);
        for (let period = 0; period < periods.length; period++) {
            
            if (jobHandle.isStopped()) throw cfg.msgCancel; 

            let startPeriod = periods[period];
            let endPeriod = new java.util.Date(startPeriod);
            endPeriod.setDate(endPeriod.getDate() + 6);

            let crits = new java.util.ArrayList();
            crits.add(BETWEEN("date", startPeriod, endPeriod));
            crits.add(EQ("user", user));
            
            let cols = new java.util.ArrayList();
                        
            if (type == types.teams) {
                cols.add(Query.sum("d.call_count").as("cc"));
                cols.add(Query.sum("d.meeting_count").as("mc"));
                cols.add(Query.sum("d.other_external_meeting_count").as("oemc"));
                cols.add(Query.sum("d.other_external_meeting_duration").as("oemd"));
                cols.add(Query.sum("d.other_meeting_count").as("omc"));
                cols.add(Query.sum("d.other_meeting_duration").as("omd"));
                cols.add(Query.sum("d.private_chat_count").as("pcc"));
                cols.add(Query.sum("d.team_chat_count").as("tcc"));
                cols.add(Query.sum("d.teams_external_meeting_count").as("temc"));
                cols.add(Query.sum("d.teams_external_meeting_duration").as("temd"));
                cols.add(Query.sum("d.teams_meeting_count").as("tmc"));
                cols.add(Query.sum("d.teams_meeting_duration").as("tmd"));
                cols.add(Query.sum("d.files_uploaded").as("fu"));
            } else {
                cols.add(Query.sum("d.conversations").as("c"));
                cols.add(Query.sum("d.received_inside_messages").as("rim"));
                cols.add(Query.sum("d.received_inside_users").as("riu"));
                cols.add(Query.sum("d.received_outside_messages").as("rom"));
                cols.add(Query.sum("d.received_outside_users").as("rou"));
                cols.add(Query.sum("d.sent_inside_messages").as("sim"));
                cols.add(Query.sum("d.sent_inside_users").as("siu"));
                cols.add(Query.sum("d.sent_outside_messages").as("som"));
                cols.add(Query.sum("d.sent_outside_users").as("sou"));
                cols.add(Query.sum("d.files_uploaded").as("fu"));
            }   
            
            let q = Query.select(cols);
            q.from(TABLES[type], "d");
            q.where(AND(crits));

            let dailies = this.exec.executeLM(q);
            let daily = dailies[0];

            let summary = this.mgr.create(table);  
            if (type == types.teams) {
                summary.set("call_count", daily["cc"]);
                summary.set("meeting_count", daily["mc"]);
                summary.set("other_external_meeting_count", daily["oemc"]);
                summary.set("other_external_meeting_duration", daily["oemd"]);
                summary.set("other_meeting_count", daily["omc"]);
                summary.set("other_meeting_duration", daily["omd"]);
                summary.set("private_chat_count", daily["pcc"]);
                summary.set("team_chat_count", daily["tcc"]);
                summary.set("teams_external_meeting_count", daily["temc"]);
                summary.set("teams_external_meeting_duration", daily["temd"]);
                summary.set("teams_meeting_count", daily["tmc"]);
                summary.set("teams_meeting_duration", daily["tmd"]);
            } else {
                summary.set("conversations", daily["c"]);
                summary.set("received_inside_messages", daily["rim"]);
                summary.set("received_inside_users", daily["riu"]);
                summary.set("received_outside_messages", daily["rom"]);
                summary.set("received_outside_users", daily["rou"]);
                summary.set("sent_inside_messages", daily["sim"]);
                summary.set("sent_inside_users", daily["siu"]);
                summary.set("sent_outside_messages", daily["som"]);
                summary.set("sent_outside_users", daily["sou"]);
            }                               
            
            summary.set("date", startPeriod);
            summary.set("period", periodWeek);
            summary.set("user", user);
            summary.set("active_days", getActiveDays(type, user, startPeriod, endPeriod));
            summary.set("files_uploaded", daily["fu"]);
            if (cfg.update) summary.save();

            // Update daily record's summary link
            let batchUpdate = dbApi.createBatchUpdate(TABLES[type]);
            batchUpdate.set("summary", summary.get("id"));
            batchUpdate.update(AND(crits));          

            rpt.totSummaryRecs++;            
        }
    }

};


/* ------------------------------------------------------------------------------------------
 Return durations of all meetings. For example, if a user has 3 meetings, then we need to 
 return the sum of 3 random durations.
------------------------------------------------------------------------------------------ */
let getDuration = function(meetingCount) {

    let duration = 0;
    
    for (let i = 0; i < meetingCount; i++) {
        let randDuration = DURATIONS[this.rand(0,1,0)];
        duration += randDuration;
    }

    return duration;
}


/* ------------------------------------------------------------------------------------------
 We need to get a list of reporting periods in the date range. The summary records needs
 a reporting period date, which is basically the first day of the week in the date range.
 So, if usage is on a Wednesday, the period will start on the previous Saturday. The period
 goes from Saturday to Sunday.
------------------------------------------------------------------------------------------ */
let getPeriods = function(startDate, endDate) {
    
    let periods = [];
    let sd = new java.util.Date(startDate);
    let ed = new java.util.Date(endDate);

    let days = getDateDiff(sd, ed) + 1;
    for (let i = 0; i < days; i++) {

        let day = new java.util.Date(sd);
        day.setDate(day.getDate() + i);
        let dayIdx = day.getDay();        

        let daysToPeriod = (dayIdx < 6) ? dayIdx + 1 : 0;
        let newDay = new java.util.Date(day);
        newDay.setDate(newDay.getDate() - daysToPeriod);                      
                    
        if (i==0) {
            periods[0] = newDay;
        } else {
            let prevPeriod = periods[periods.length-1];                   
            if (newDay.getDate() != prevPeriod.getDate())
                periods[periods.length] = newDay;                                         
        }        
    }

    return periods;
};


let getMinOrMaxDate = function(user, idx, type) {

    let cols = new java.util.ArrayList();
    if (idx == 0)
        cols.add(Query.min("d.date").as("date"));
    else 
        cols.add(Query.max("d.date").as("date"));

    let q = Query.select(cols);
    q.from(TABLES[type], "d");
    q.where(EQ("d.user", user))
    return this.exec.execute1(q);    
};


let getActiveDays = function(type, user, startPeriod, endPeriod) {

    let crits = new java.util.ArrayList();
    crits.add(BETWEEN("date", startPeriod, endPeriod));
    crits.add(EQ("user", user));
    crits.add(EQ("active", true));
    let cols = new java.util.ArrayList();
    cols.add(Query.count("d.id").as("count"));
    let q = Query.select(cols);
    q.from(TABLES[type], "d");
    q.where(AND(crits));
    return this.exec.execute1(q);
};


/* ----------------------------------------------------------------------------------------------------------------

 STARTING POINT

---------------------------------------------------------------------------------------------------------------- */ 
try {
  
    run(); 
  
} catch (e) {
  
	rpt.err = e;
  
} finally {
  
	let result = String.format("Daily Records created: {0}, Summary Records Created: {1}, last error: {2}, update flag = {3}, debug={4}", 
		rpt.totDailyRecs,
        rpt.totSummaryRecs,
		rpt.err,
		cfg.update,
		cfg.debug);

	jobState.onProgress(100.0, result);			
};