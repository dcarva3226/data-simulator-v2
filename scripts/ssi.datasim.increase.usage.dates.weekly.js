/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.increase.usage.dates.weekly.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 3/3/2025
 @Notes: Increment dates across the various tables that we generate data for. The array tables
 contains all of the tables that we need to update. The cols array contains all of the different possible
 date columns that we need to update. EUX and Journey data is already recent. The cfg.days variable needs
 to be in increments of a week. (i.e. 7, 14, 21)
 
 @IMPORTANT! 
 The initial script run should be run with update=false to make sure that there are no dates that fall into
 the future. If it finds a problematic date, the script will fail. If it fails, those dates needs to be 
 fixed up.

 Snapshots: before these scripts were run, snapshots ended on 3/21/2024. Subsequent snapshot end dates
 need to take the cfg.days below into consideration.
=============================================================================================================*/

let cfg = {
    days        : 7, // Must be in increments of weeks (i.e. 7, 14, 21)
    debug       : "None",
    msgCancel   : "The script has been manually cancelled...",
    update      : true
};

let rpt = {	
    err        : "None", 
    future     : 0,
    totRecs    : 0,
};

let tbls = ["cmdb_user_logon",
            "cmdb_program_crash",
            "cmdb_system_crash",
            "cmdb_user_break_time",
            "saas_user_daily_activity",
            "saas_user_summary_activity",
            "cmdb_device_resource_util",
            "acu_survey",
            "acu_survey_feedback",
            "cmdb_teams_meeting_participant",
            "cmdb_program_daily_usage",
            "cmdb_program_usage_details",
            "cmdb_program_hourly_usage"];

let cols = ["date",
            "timestamp",
            "usage_date", 
            "start_time", 
            "end_time",
            "first_activity", 
            "last_activity", 
            "login_time", 
            "logout_time",
            "begin_time",
            "begin_time_local",
            "end_time",
            "end_time_local",
            "progress_time",
            "progress_time_local",
            "expiration_date",
            "answered_on"]

let run = function() {

    if (!doesTableExist("ds_date_increment_log")) {
        throw "The increment log table does not exist.";
    }

    for (let i = 0; i < tbls.length; i++) {

        let tbl = tbls[i];

        let qs = getCurrentMillis();
        let q = this.mgr.query(tbl);
        let records = q.executeLazily();        
        let totRecs = this.mgr.query(tbl).count();
        let totTblRecs = 0;

        // Get the date columns for the current table
        let dateColumns = getDateColumns(tbl, this.cols);

        // Loop through usage tables with dates
        while (records.hasNext()) {

            if (jobHandle.isStopped()) throw cfg.msgCancel;  
            let record = records.next();

            // Loop through all all columns in the current record
            for (let x = 0; x < dateColumns.length; x++) {
                
                let columns = dateColumns[x];          
                let column = columns["column"];
                let type = columns["type"];
                    
                let oldValue = record.get(column);
                if (!oldValue ) continue;

                // Now shift the date over 7 (or so) days (next week)
                let dateValue = new java.util.Date(oldValue);
                dateValue = shiftDate(dateValue, cfg.days);

                let day = dateValue.getDate();
                let month = dateValue.getMonth()+1;
                let year = parseInt(dateValue.getYear()+1900).toFixed(0);
                let newDate = null;

                if (type == "datetime" || type == "timestamp") {

                    let hour = dateValue.getHours();
                    let min = dateValue.getMinutes();
                    let sec = dateValue.getSeconds();
                    newDate = this.buildDate(new java.util.Date(month + "/" + day + "/" + year), hour, min, sec);

                } else {                                                                                             
                    newDate = new java.util.Date(month + "/" + day + "/" + year);
                }

                // Is this date in the future?
                if (getDateDiff(newDate, java.util.Date()) < 0) {
                    rpt.future++;
                    continue;                                
                }

                record.set(column, newDate);                                                                                   
            }

            // Save record after each column is updated
            if (cfg.update && record.isModified()) record.save();  

            rpt.totRecs++;
            totTblRecs++;
                                                
            if ((rpt.totRecs % 10) == 0) {
                jobState.onProgress(0.0, String.format("Recs processed: {0} of {1} for table '{2}'",
                    totTblRecs,
                    totRecs,
                    tbl));
            }             
        }

        // Log table statistics
        let qryTime = Math.round((getCurrentMillis() - qs)/60000);	
        let log = this.mgr.create("ds_date_increment_log");
        log.set("table", tbl);
        log.set("records", totTblRecs);
        log.set("columns", dateColumns.length);
        log.set("duration_mins", qryTime);
        log.save();        
    }
}

let shiftDate = function(oldDate, daysToIncrease) {

    let newDate = oldDate;
    newDate.setDate(newDate.getDate() + daysToIncrease);
    return newDate;
};

let getDateColumns = function(table, columns) {

    let crits = new java.util.ArrayList();
    crits.add(EQ("tbl.name", table));
    crits.add(IN("col.name", columns));
    crits.add(IN("type.name", ["datetime", "date", "timestamp"]));

    let cols = new java.util.ArrayList();
    cols.add(Query.column("col.name", "column"));
    cols.add(Query.column("type.name", "type"));

    let q = Query.select(cols);
    q.from("sys_db_column", "col");
    q.join("sys_db_table", "tbl", "tbl.id", "col.table_id");
    q.join("sys_type", "type", "type.id", "col.type_id");    
    q.where(AND(crits));
    return this.exec.executeLM(q);
};

let doesTableExist = function(table, column) {
    
    let q = Query.select(Query.column("tbl.id"));
    q.from("sys_db_table", "tbl");
    q.where(EQ("tbl.name", table));
    let result = this.exec.executeL1(q);
    return (result.length == 1) ? true : false;
};

/* ----------------------------------------------------------------------------------------------------------------
 STARTING POINT
---------------------------------------------------------------------------------------------------------------- */ 
try {
  
	run();  
  
} catch (e) {
  
	this.rpt.err = e;
  
} finally {
	  
	let result = String.format("Total Records Updated: {0}, future dates: {1}, last error: {2}, update flag: {3}, debug: {4}", 
		this.rpt.totRecs,
        this.rpt.future,
		this.rpt.err,
		this.cfg.update,
		this.cfg.debug);

	jobState.onProgress(100.0, result);			
};