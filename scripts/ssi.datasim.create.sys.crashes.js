/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.create.sys.crashes.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 4/15/2024
=============================================================================================================*/

let cfg = {
      debug       : "None",
      source      : "@datasim",
      update      : true
};

let rpt = {	
      err         : "None", 
      logName     : "Create System Crashes",
      params      : "",
      totCrashes  : 0,
      totCrashErr : 0
};

let tbl = {
      cfg         : "ds_crash_system_config",   
      comp        : "cmdb_ci_computer",
      crash_sys   : "cmdb_system_crash",
      log         : "ds_crash_system_log",
      manuf       : "ds_crash_system_manufacturer",      
      per         : "cmn_person",  
      usr_inc     : "ds_crash_system_user_include",
      usr_exc     : "ds_crash_system_user_exclude",
      user        : "cmn_user"
};

let run = function() {

      let objCfg        = loadCfg();   
      let users         = getUsers();
      let startDate     = new java.util.Date(objCfg.start_date);
      let endDate       = new java.util.Date(objCfg.end_date);
      let days          = getDateDiff(startDate, endDate) + 1;      

      // Calculate predicted total records
      let targetDate    = new java.util.Date(objCfg.start_date); 
      let daysCnt = 0;
            
      // Loop through each day in the date range          
      for (let day = 0; day < days; day++) {            
      
            let dayCnt = (day > 0) ? 1 : 0;    
            targetDate.setDate(targetDate.getDate() + dayCnt);                
            if (this.excludedDay(targetDate, objCfg.exclude_weekends)) continue;                  
                  
            if (jobHandle.isStopped()) throw "Script job was cancelled...";
     
            createSystemCrash(objCfg,                 
                  users,
                  targetDate);
                  
            let percentage = ((day / days) * 100.0);
            jobState.onProgress(percentage, 
                  String.format("{0} out of {1} days processed...", 
                        day,
                        days));
      }
};

/* ----------------------------------------------------------------------------------------------------------------
 FUNCTIONS
---------------------------------------------------------------------------------------------------------------- */ 

// Get the configuration parameters
let loadCfg = function() {
	
	let objConfig = {
            start_date : null,
            end_date : null,
            sys_min : 0,
            sys_max : 0,
            exclude_weekends : true,
            scatter : 0,
            start_hour : 0     
	};
	
	let configs = this.mgr.readAllLazily(this.tbl.cfg);
	
	while (configs.hasNext()) 
	{							
		let val = null;
		let config = configs.next();
		let varName = config.get("var_name").replace("ds_cfg_", "");
		let value = config.get("value");
		let type = config.get("type");
		
		switch (type) {
			case "int" :
				val = parseInt(value);
				break;
			case "date" :
				val = new java.util.Date(value);
				break;
			case "array" :			
				val = value.split(";");
				break;
			case "bool" : 
				val = (value == "TRUE") ? true : false;
				break;
			default :
				val = value;
				break;
		}
		
		objConfig[varName] = val;
		this.rpt.params += varName + ":" + val + ", ";
	}
	
	return objConfig;
      
};

// For each user's computer, create a series of crashes
let createSystemCrash = function(objCfg, users, targetDate) {
      
	let scatterPerc = objCfg.scatter;
      
      for (let i = 0; i < users.length; i++) {
            
            let rnd = rand(1, 100, 0);
            if (rnd <= scatterPerc) continue;            
            
            let user = users[i];
            let installedOn = getComputer(user);

            if (installedOn) {

                  let numCrashes = this.rand(objCfg.sys_min, objCfg.sys_max, 0);
                  let rnd = objCfg.start_hour;
                  
                  for (let n = 0; n < numCrashes; n++) {
                        
                        rnd += this.rand(1, 2, 0);
                        let Calendar = java.util.Calendar;
                        let cal = Calendar.getInstance();
                        cal.setTime(targetDate);
                        cal.set(Calendar.HOUR_OF_DAY, rnd); // if I don't add 5, it sets to yesterday
                        cal.set(Calendar.MINUTE, this.rand(n, 60, 0));
                        let timestamp = cal.getTime();
                      
                        cal.set(Calendar.HOUR_OF_DAY, 5);
                        cal.set(Calendar.MINUTE, 0);
                        cal.set(Calendar.SECOND, 0);
                        let timestamp1 = cal.getTime();

                        cal.set(Calendar.HOUR_OF_DAY, 28);
                        cal.set(Calendar.MINUTE, 59);
                        cal.set(Calendar.SECOND, 59);
                        let timestamp2 = cal.getTime();

                        // Avoid some duplication
                        let crit = new java.util.ArrayList();
                        crit.add(EQ("computer", installedOn)); 
                        crit.add(BETWEEN("timestamp", timestamp1, timestamp2));
                        let crashCount = this.mgr.query(this.tbl.crash_sys).where(AND(crit)).count();                        

                        if (crashCount < objCfg.sys_max) {
                              
                              let crash = this.mgr.create(this.tbl.crash_sys);
                              crash.set("computer", installedOn);
                              crash.set("timestamp", timestamp);                            
                              if (this.cfg.update) crash.save();
                              this.rpt.totCrashes++;

                        } else {
                              this.rpt.totCrashErr++;
                        }
                  }
            }
      }
};

// Get computer via primary user
let getComputer = function(user) {

      let q = Query.select(java.util.Arrays.asList(Query.column("c.id", "id")));
      q.from(this.tbl.comp, "c");
      q.where(EQ("c.primary_user", user));
      q.limit(1);
      return this.exec.execute1(q)    

};

// Get users without excluded users
let getUsers = function() {

      let manufUsrs = [];
      let incUsrs   = getConfigData(this.tbl.usr_inc, "user");
      let excUsrs   = getConfigData(this.tbl.usr_exc, "user");      

      // Are we grabbing users from computers matching a manufacturer?
      let q1 = Query.selectDistinct(java.util.Arrays.asList(Query.column("m.manufacturer", "manufacturer")));
      q1.from(this.tbl.manuf, "m");
      q1.join(this.tbl.comp, "c", "c.manufacturer", "m.manufacturer");
      q1.join(this.tbl.user, "u", "u.id", "c.primary_user");
      q1.where(ILIKE("u.source", "%" + this.cfg.source + "%"));
      let manufs = this.exec.executeL1(q1);
            
      if (manufs.length != 0) {
            
            let q = Query.selectDistinct(java.util.Arrays.asList(Query.column("u.id", "id")));
            q.from(this.tbl.user, "u");
            q.join(this.tbl.comp, "c", "c.primary_user", "u.id");
            q.join(this.tbl.per, "p", "p.id", "u.person");
            q.where(AND(ILIKE("u.source", "%" + this.cfg.source + "%"), IN("c.manufacturer", manufs)));
            manufUsrs = exec.executeL1(q);
            
      }  

      // Now do run a query with all criteria includedd
      let criterion = new java.util.ArrayList();
      criterion.add(ILIKE("u.source", "%" + this.cfg.source + "%"));
      criterion.add(NOT_IN("u.id", excUsrs));
      criterion.add(OR(IN("u.id", incUsrs), IN("u.id", manufUsrs)));
               
      let q = Query.selectDistinct(java.util.Arrays.asList(Query.column("u.id", "id")));
      q.from(this.tbl.user, "u");
      q.join(this.tbl.per, "p", "p.id", "u.person");
      q.where(AND(criterion));

      return this.exec.executeL1(q);

};


// Write results to log
let logDetails = function() {
	
      let log = this.mgr.create(this.tbl.log);
      log.set("name", this.rpt.logName);
      log.set("recs_created", this.rpt.totCrashes);
      log.set("parameter_list", this.rpt.params);
      log.set("err", this.rpt.err);
      log.save();
	
};

let getConfigData = function(tbl, field) {

	let q = Query.select(java.util.Arrays.asList(Query.column("x." + field, field)));
	q.from(tbl, "x");
	return this.exec.executeL1(q);
      
};

/* ----------------------------------------------------------------------------------------------------------------
 STARTING POINT
---------------------------------------------------------------------------------------------------------------- */ 
try {
  
	run();  
  
} catch (e) {
  
	this.rpt.err = e;
  
} finally {
	
	logDetails();
  
	let result = String.format("Crashes: {0}, failed: {1}, last error: {2}, update flag: {3}, debug: {4}", 
		this.rpt.totCrashes,
		this.rpt.totCrashErr,
		this.rpt.err,
		this.cfg.update,
		this.cfg.debug);

	jobState.onProgress(100.0, result);			
};