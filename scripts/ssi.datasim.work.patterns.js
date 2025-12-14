/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.work.patterns.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 3/27/2024
 @Notes: users must have user logon records and also Productivity module licenses allocated. This script 
 currently doesn't create user breaks at the 18:00 hour. Todo maybe.
 
 Old comment below. Not sure if this means clear them out manually?
 Clear out user break records before running this script, otherwise you'll have some duplication.
=============================================================================================================*/

const cfg = {
      debug       : "None",
      msgCancel	: "The script has been manually cancelled...",
      skipWknds   : true,
      userbreak   : true,
      hourly      : false,
      update	: true	
};

const rpt = {
      err         : "None",
      totPer      : 0,
      totPerProc  : 0,
      totRecs     : 0
};

const locations = ["India", "US", "UK", "Australia"];

let run = function() {

      let startDate = new java.util.Date("1/21/2024");
      let endDate   = new java.util.Date("3/21/2024");

      let cols = new java.util.ArrayList();
      cols.add(Query.column("u.id", "user"));      
      cols.add(Query.column("c.id", "computer"));
      cols.add(Query.column("c.virtual", "virtual"));

      jobState.onProgress(1.0, "Running query to read person data...");		
      let q = Query.selectDistinct(cols);
      q.from("cmn_person", "p");
      q.join("cmn_user", "u", "u.person", "p.id");
      q.join("cmdb_ci_computer", "c", "c.primary_user", "u.id");
      q.join("acu_group_person", "agp", "agp.person", "p.id");
      q.join("acu_group", "ag", "ag.id", "agp.group");
      q.join("acu_group_type", "agt", "agt.id", "ag.type");
      q.where(AND(IN("ag.name", this.locations), EQ("agt.name", "Location")));
      let persons = this.exec.executeLM(q);
      rpt.totPer = persons.length;

      let days = getDateDiff(startDate, endDate);
      
      for (let y = 0; y < days; y++) {
                        
            let curDate = new java.util.Date(startDate);
            curDate.setDate(curDate.getDate() + y);     
            if (this.excludedDay(curDate, cfg.skipWknds)) continue;
            let hours = [0,0,0,0,0,0,0,0,0,0];
            let totPerProc = 0;    

            for (let i = 0; i < rpt.totPer; i++) {

                  if (jobHandle.isStopped()) throw cfg.msgCancel;
                  
                  if (totPerProc % 10 == 0) {
                        let percentage = ((y / days) * 100.0);
                        jobState.onProgress(percentage, String.format("Processing user {0} of {1} for date {2}...",
                              totPerProc,
                              rpt.totPer,
                              curDate));
                  }                  

                  let person = persons[i];
                  let user = person["user"];
                  let computer = person["computer"];
                  let virtual = person["virtual"];
                  
                  let startDateTS = null, endDateTS = null;
                                   
                  if (cfg.userbreak) {
                        
                        // Does this person have usage on the given date?
                        if (!hasUsage(user, computer, curDate)) continue;                        
                        
                        let stHour = this.rand(8, 17, 0);
                        let stMinute = this.rand(0, 59, 0);
                        let stSecond = this.rand(0, 59, 0);
                        
                        // Randomize it per hour
                        switch (stHour) {
                              case 8 :
                                    if (hours[0] == 7) continue;
                                    hours[0]++;
                                    break;                              
                              case 9 :
                                    if (curDate.getDay() == 2) {
                                          if (hours[1] == 10)
                                                continue;
                                    } else if (hours[1] == 7) {
                                          continue;
                                    }
                                    hours[1]++;
                                    break;                              
                              case 10 :
                                    if (curDate.getDay() == 1 || curDate.getDay() == 4) {
                                          if (hours[2] == 16) continue;
                                    } else if (hours[2] == 10) {
                                          continue;
                                    }
                                    hours[2]++;
                                    break;
                              case 11 :
                                    if (curDate.getDay() == 3) {
                                          if (hours[3] == 10) continue;
                                    } else if (hours[3] == 10) {
                                          continue;
                                    }
                                    hours[3]++;
                                    break;   
                              case 12 :
                                    if (curDate.getDay() == 4) {
                                          if (hours[4] == 7) continue;
                                    } else if (hours[4] == 23) {
                                          continue;
                                    }
                                    hours[4]++;
                                    break;                              
                              case 13 :
                                    if (curDate.getDay() == 5) {
                                          if (hours[5] == 7) continue;
                                    } else if (hours[5] == 10) {
                                          continue;
                                    }
                                    hours[5]++;
                                    break;  
                              case 14 :
                                  if (curDate.getDay() == 4) {
                                          if (hours[6] == 7) continue;
                                    } else if (hours[6] == 10) {
                                          continue;
                                    }
                                    hours[6]++;
                                    break;                       
                              case 15 :   
                                    if (hours[7] == 7) continue;
                                    hours[7]++;
                                    break;
                              case 16 :
                                    if (hours[8] == 2) continue;
                                    hours[8]++;
                                    break;
                              case 17 :
                                    if (hours[9] == 2) continue;
                                    hours[9]++;
                                    break;                                 
                        }

                        let etHour = stHour + this.rand(0, 3, 0);
                        let etMinute = stMinute + this.rand(0, 15, 0);
                        let etSecond = stSecond + this.rand(0, 15, 0);

                        if (etHour > 17) etHour = 17;
                        if (etMinute > 59) etMinute = 55;
                        if (etSecond > 59) etSecond = 55;
                        
                        // Make sure each start/end has at least 15 mins
                        if (stHour == etHour && (etMinute - stMinute < 15)) {
                              stMinute = this.rand(1, 5, 0);
                              etMinute = this.rand(20, 45, 0);
                        }

                        startDateTS = this.buildDate(curDate, stHour, stMinute, stSecond);
                        endDateTS = this.buildDate(curDate, etHour, etMinute, etSecond);       

                        let entity = this.mgr.create("cmdb_user_break_time");
                        entity.set("user", user);
                        entity.set("computer", computer);
                        entity.set("start_time", startDateTS);
                        entity.set("end_time", endDateTS);
                        if (cfg.update) entity.save();
                        
                        // Does the user have logon records?
                        createLogons(user, computer, virtual, curDate, startDateTS, endDateTS);                        
                  }
                  
                  // Create the out of hours data
                  if (cfg.hourly) {
                        
                        // We need to create program hourly usage. Find one daily usage record for current user
                        // and create a program hourly record in out of office hours
                        
                        if (this.rand(1, 50, 0) == 1) { // randomize a bit
                              let daily = getDailyUsageRecord(user, computer, curDate);
                              if (daily) {
                                    
                                    let hour = 0;
                                    if (this.rand(1, 2, 0) == 1)
                                          hour = this.rand(6, 7, 0);
                                    else
                                          hour = this.rand(18, 19, 0);
                                    
                                    let ts = this.buildDate(curDate, hour, 0, 0);
                                    
                                    let entity = this.mgr.create("cmdb_program_hourly_usage");
                                    entity.set("daily_usage", daily);
                                    entity.set("minutes_in_use", this.rand(1, 9, 0));
                                    entity.set("start_time", ts);
                                    entity.set("usage_hour", hour);
                                    if (cfg.update) entity.save();
                              }
                              
                              // Does the user have logon records?
                              createLogons(user, computer, virtual, curDate, startDateTS, endDateTS);                              
                        }
                  }
                  
                  totPerProc++;                  
                  rpt.totRecs++;
            }
      }
};

let getDailyUsageRecord = function(user, computer, curDate) {
      
      let crit = new java.util.ArrayList();
      crit.add(EQ("du.user", user));
      crit.add(EQ("du.used_from", computer));
      crit.add(EQ("du.usage_date", curDate));
      crit.add(GT("du.minutes_in_use", 10));      
      
      let q = Query.select(Query.column("id"), "id");
      q.from("cmdb_program_daily_usage", "du");
      q.where(AND(crit));
      q.limit(1);
      return this.exec.execute1(q);
};

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

let hasUsage = function(user, computer, curDate) { 

      let crit = new java.util.ArrayList();
      crit.add(EQ("user", user));
      crit.add(EQ("used_from", computer));
      crit.add(EQ("usage_date", curDate));
      
      let q = Query.select(Query.column("id"), "id");
      q.from("cmdb_program_daily_usage", "du");
      q.where(AND(crit));
      q.limit(1);
      let usage = this.exec.executeL1(q).length;
      
      return (usage == 0) ? false : true;
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
  
	let result = String.format("Persons processed: {0}, records created: {1}, last error: {2}, update flag = {3}, debug={4}", 
		rpt.totPer,
		rpt.totRecs,
		rpt.err,
		cfg.update,
		cfg.debug);

	jobState.onProgress(100.0, result);			
};