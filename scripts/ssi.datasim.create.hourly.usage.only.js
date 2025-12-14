/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.create.hourly.usage.only.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 1/22/2025

 Some daily usage has not program hourly usage. This script creates the hourly usage.
=============================================================================================================*/

const cfg = {
    days            : 1, // Number of days to query back in time
    debug           : "None",
    msgCancel	    : "The script has been manually cancelled...",
    update	        : true	
};

const rpt = {
    err             : "None",
    totDailyRecs    : 0,
    totDailySet     : 0,
    totNullUseTime  : 0,
    totSkip         : 0
};

let run = function() {

    let startDate = new java.util.Date();
    startDate.setDate(startDate.getDate() - cfg.days);

    jobState.onProgress(1.0, "Running query to read daily usage records...");		

    let cols = new java.util.ArrayList();
    cols.add(Query.column("du.id", "id"));
    cols.add(Query.column("du.use_time", "use_time")); 
    cols.add(Query.column("du.usage_date", "usage_date"));

    let dq = Query.select(cols);
    dq.from("cmdb_program_daily_usage", "du");
    dq.where(GE("du.created_on", startDate))
    let dailies = this.exec.executeLM(dq);
    rpt.totDailyRecs = dailies.length;

    for (let i = 0; i < rpt.totDailyRecs; i++) {
                    
        if (jobHandle.isStopped()) throw cfg.msgCancel;        
        let daily = dailies[i];
        let dailyUsage = daily["id"];
        let useTime = daily["use_time"];
        let usageDate = daily["usage_date"];

        // If the daily usage record has use time, continue
        if (useTime != null) {

            // Does the daily usage record point to hourly usage?
            let huCnt = Query.select(Query.column("id"))
                            .from("cmdb_program_hourly_usage")
                            .where(EQ("daily_usage", dailyUsage))
                            .count();

            if (huCnt > 0) {
                rpt.totSkip++;
                continue;
            }

            // Break apart the useTime array to insert into hourly usage
            for (let y = 0; y <= 23; y++) {

                let useTimeMins = useTime[y];          
                if (useTimeMins == 0) continue;
                let hourly = this.mgr.create("cmdb_program_hourly_usage");
                hourly.set("daily_usage", dailyUsage);
                hourly.set("usage_hour", y);
                hourly.set("minutes_in_use", useTimeMins);
                hourly.set("start_time", getStartTime(usageDate, y));
                if (cfg.update) hourly.save();
            }
            
            rpt.totDailySet++;        

        } else {
            rpt.totNullUseTime++;
        }

        jobState.onProgress(1.0, "Processing daily usage record " + i + " of " + rpt.totDailyRecs);
    }
};


let getStartTime = function(dt, hour) {

    let Calendar = java.util.Calendar;
    let cal = Calendar.getInstance();
    cal.setTime(dt);
    cal.set(Calendar.HOUR_OF_DAY, hour);
    cal.set(Calendar.MINUTE, 0);
    cal.set(Calendar.SECOND, 0);
    return cal.getTime();    
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
  
	let result = String.format("Records fully processed: {0}/{1}, skipped: {2}, missing use_time: {3}, last error: {4}, update flag = {5}, debug={6}", 
		rpt.totDailySet,
        rpt.totDailyRecs,
        rpt.totSkip,
        rpt.totNullUseTime,
		rpt.err,
		cfg.update,
		cfg.debug);

	jobState.onProgress(100.0, result);			
};