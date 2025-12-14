/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.create.logons.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 2/24/2025
 @Notes: Create logon records for users with usage. Very useful for Out of Office Hours in Work Patterns. 
 In order that chart to populate, logon records are needed. This script expect daily usage to already
 exist.
=============================================================================================================*/

let cfg = {
    debug       : "None",
    update      : true,
    startDate   : new java.util.Date("10/1/2023"),
    endDate     : new java.util.Date("12/31/2023")
};

let rpt = {	
    err        : "None", 
    totRecs    : 0,
};

let run = function() {

    let cols = new java.util.ArrayList();
    cols.add(Query.column("u.usage_date", "usage_date"));
    cols.add(Query.column("u.user", "user"));
    cols.add(Query.column("u.used_from", "used_from"));
    cols.add(Query.column("u.thin_client", "thin_client"));

    let q = Query.select(cols);
    q.from("cmdb_program_daily_usage", "u");
    q.where(BETWEEN("u.usage_date", cfg.startDate, cfg.endDate));
    let usages = this.exec.executeLM(q); 
    let totUsage = usages.length;

    for (let i = 0; i < totUsage; i++) {    

        if (jobHandle.isStopped()) throw "Script cancelled manually...";

        let usage = usages[i];
        let usageDate = usage["usage_date"];
        let user = usage["user"];
        let usedFrom = usage["used_from"];
        let virtual = usage["thin_client"];

        startDateTS = this.buildDate(usageDate, 6, this.rand(0,10,0), this.rand(0,59,0));
        endDateTS = this.buildDate(usageDate, 19, this.rand(0,10,0), this.rand(0,59,0));  
        createLogons(user, usedFrom, virtual, usageDate, startDateTS, endDateTS); 
        rpt.totRecs++;

        jobState.onProgress(0.0, String.format("Daily rec {0} of {1}, Total recs created: {2}.",
            i,
            totUsage,
            rpt.totRecs)
        );        
    }
}

let createLogons = function(user, computer, virtual, curDate, sd, ed) { 

    let crit = new java.util.ArrayList();
    crit.add(EQ("user", user));
    crit.add(EQ("used_from", computer));
    crit.add(EQ("usage_date", curDate));
    
    let q = Query.select(Query.column("id"), "id");
    q.from("cmdb_user_logon", "du");
    q.where(AND(crit));
    q.limit(1);
    let logons = this.exec.executeL1(q).length;
    
    if (logons == 0) {
          
          let logon = this.mgr.create("cmdb_user_logon");         
          let startDateTS = this.buildDate(curDate, 8, this.rand(0, 3, 0), this.rand(0, 59, 0));
          let endDateTS = this.buildDate(curDate, this.rand(17, 19, 0), this.rand(0, 59, 0), this.rand(0, 59, 0));            

          // Make sure we didn't create dates outside boundaries
          if (startDateTS > sd) startDateTS = this.buildDate(curDate, 8, 0, 0);        
          if (endDateTS < ed) endDateTS = this.buildDate(curDate, 19, 59, 59);

          logon.set("used_from", computer);
          logon.set("user", user);
          logon.set("usage_date", curDate);
          logon.set("day_of_week", curDate.getDay());
          logon.set("logon_to", computer);
          logon.set("first_activity", startDateTS);
          logon.set("last_activity", endDateTS);
          logon.set("login_time", startDateTS);
          logon.set("logout_time", endDateTS);
          logon.set("thin_client", virtual);
          logon.set("minutes_logged_in", getMinsDiff(startDateTS, endDateTS));
          if (cfg.update) logon.save();
    }
};


let getMinsDiff = function(sd, ed) {

    let msInMinute = 60 * 1000;
    let diff =  Math.round(Math.abs(ed.getTime() - sd.getTime()) / msInMinute);
    return diff;
};


/* ----------------------------------------------------------------------------------------------------------------
 STARTING POINT
---------------------------------------------------------------------------------------------------------------- */ 
try {
  
	run();  
  
} catch (e) {
  
	this.rpt.err = e;
  
} finally {
	  
	let result = String.format("Logon Records Created: {0}, last error: {1}, update flag: {2}, debug: {3}", 
		this.rpt.totRecs,
		this.rpt.err,
		this.cfg.update,
		this.cfg.debug);

	jobState.onProgress(100.0, result);			
};