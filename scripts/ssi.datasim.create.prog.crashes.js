/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.create.prog.crashes.js
 @Author: Danny Carvajal
 @Version: 1.0.0
 @Date: 3/27/2024
=============================================================================================================*/

let cfg = {
      debug       : "None",
      source      : "@datasim",
      update      : true
};

let rpt = {	
      err         : "None", 
      logName     : "Create Program Crashes",
      params      : "",
      totCrashes  : 0,
      totCrashErr : 0,
      totProgs    : 0,
      totProgInst : 0,
      totSpkgs    : 0      
};

let tbl = {
      cfg         : "ds_crash_prog_config",
      cmpny       : "cmdb_discovered_company",      
      comp        : "cmdb_ci_computer",
      crash_prog  : "cmdb_program_crash",
      log         : "ds_crash_prog_log",
      manuf       : "ds_crash_prog_manufacturer",
      per         : "cmn_person",
      prog        : "cmdb_program",
      prog_inst   : "cmdb_program_instance", 
      spkg        : "cmdb_ci_spkg",      
      soft        : "ds_crash_prog_software",
      usr_inc     : "ds_crash_prog_user_include",
      usr_exc     : "ds_crash_prog_user_exclude",
      user        : "cmn_user"
};

let run = function() {

      let objCfg        = loadCfg();      
      let users         = getUsers();
      let programs      = getPrograms();
      let progLen       = programs.length;
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
      
            for (var i = 0; i < progLen; i++) {
                  
                  if (jobHandle.isStopped()) throw "Script job was cancelled...";
           
                  createProgramCrash(objCfg,
                        programs[i],                  
                        users,
                        targetDate);
                        		
                  let percentage = ((day / days) * 100.0);
                  jobState.onProgress(percentage, 
                        String.format("{0} out of {1} days processed...", 
                              day,
                              days));
            }            
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
            prog_min : 0,
            prog_max : 0,
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
let createProgramCrash = function(objCfg, program, users, targetDate) {

	let scatterPerc = objCfg.scatter;
      
      for (let i = 0; i < users.length; i++) {

            let rnd = rand(1, 100, 0);
            if (rnd <= scatterPerc) continue;  
            
            let user = users[i];
            let installedOn = getComputer(user);

            if (installedOn) {

                  let programInstance = getOrCreateProgramInstance(installedOn, program);
                  let numCrashes = this.rand(objCfg.prog_min, objCfg.prog_max, 0);
                  let rnd = objCfg.start_hour;
                  
                  for (let n = 0; n < numCrashes; n++) {
                        
                        rnd += this.rand(1, 2, 0);
                        let Calendar = java.util.Calendar;
                        let cal = Calendar.getInstance();
                        cal.setTime(targetDate);
                        cal.set(Calendar.HOUR_OF_DAY, rnd);
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
                        crit.add(EQ("program_instance", programInstance));
                        crit.add(EQ("computer", installedOn)); 
                        crit.add(BETWEEN("timestamp", timestamp1, timestamp2));
                        let crashCount = this.mgr.query(this.tbl.crash_prog).where(AND(crit)).count();
                        
                        if (crashCount < objCfg.prog_max) {
                              
                              let crash = this.mgr.create(this.tbl.crash_prog);
                              crash.set("computer", installedOn);
                              crash.set("program_instance", programInstance);
                              crash.set("command_line_args", "\"" + program.file_path + "\"");
                              crash.set("timestamp", timestamp);
                              crash.set("user", user);                              
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

// Get list of programs to run against
let getPrograms = function() {
      
      let cols = new java.util.ArrayList();
      cols.add(Query.column("s.publisher", "publisher"));
      cols.add(Query.column("s.spkg", "spkg"));
      cols.add(Query.column("s.spkg_version", "spkg_version"));
      cols.add(Query.column("s.file_name", "file_name"));      
      cols.add(Query.column("s.file_path", "file_path"));      
      cols.add(Query.column("s.file_version", "file_version"));       

      let q = Query.select(cols);
      q.from(this.tbl.soft, "s");
      q.where(EQ("s.enabled", true));
      q.orderBy("s.created_on", Order.ASC);
      return exec.executeLM(q);
      
};

// Write results to log
let logDetails = function() {
	
      let log = this.mgr.create(this.tbl.log);
      log.set("name", this.rpt.logName);
      log.set("recs_created", this.rpt.totCrashes);
      log.set("parameter_list", this.rpt.params);
      log.set("err", this.rpt.err);
      log.set("prog_created", this.rpt.totProgs);
      log.set("prog_inst_created", this.rpt.totProgInst);
      log.set("spkg_created", this.rpt.totSpkgs);
      log.save();
	
};

let getConfigData = function(tbl, field) {

	let q = Query.select(java.util.Arrays.asList(Query.column("x." + field, field)));
	q.from(tbl, "x");
	return this.exec.executeL1(q);
      
};

/* ----------------------------------------------------------------------------------------------------------------
 SOFTWARE CREATION FUNCTIONS
---------------------------------------------------------------------------------------------------------------- */ 

// Get or create the needed program instance for daily usage records
let getOrCreateProgramInstance = function(installedOn, software) {

      let company = getOrCreateCompany(software.publisher);
      let spkg = getOrCreateSpkg(installedOn, company, software);      
        
      let crit = new java.util.ArrayList();
      crit.add(EQ("pi.installed_on", installedOn));
      crit.add(EQ("pi.spkg", spkg));
      crit.add(ILIKE("pi.install_path", software["file_path"].replace(/\\/g, "\\\\")));
      crit.add(ILIKE("p.file_name", software["file_name"].replace(/\\/g, "\\\\")));
      crit.add(EQ("p.file_version", software.file_version));
      crit.add(EQ("p.publisher", company));

      // First check to see if it exists
      let q = Query.select(java.util.Arrays.asList(Query.column("pi.id", "id")));
      q.from(this.tbl.prog_inst, "pi");
      q.join(this.tbl.prog, "p", "p.id", "pi.program");
      q.where(AND(crit));
      q.limit(1);
      let progInst = this.exec.execute1(q)

      if (!progInst) {
            progInst = createProgramInstance(installedOn, spkg, company, software);
      }

      return progInst;
      
};

// Create program instance and program if needed
let createProgramInstance = function(installedOn, spkg, company, software) {
    
      let fileName = software.file_name;
      let fileVersion = software.file_version;
    
      let crit = new java.util.ArrayList();      
      crit.add(EQ("p.file_name", fileName));
      crit.add(EQ("p.file_version", fileVersion));
      crit.add(EQ("p.publisher", company));
      
      // Does the needed program already exist?
      let q = Query.select(java.util.Arrays.asList(Query.column("id", "id")));  
      q.from(this.tbl.prog, "p");
      q.where(AND(crit));
      q.limit(1);
      q.orderBy("p.created_on", Order.DESC);
      let programId = this.exec.execute1(q);

      if (!programId) {
            programId = createProgram(software, company);
      }

      let progInst = this.mgr.create(this.tbl.prog_inst);
      progInst.set("installed_on", installedOn);
      progInst.set("program", programId);
      progInst.set("operational", true);
      progInst.set("install_path", software.file_path);
      progInst.set("type", 1);
      progInst.set("spkg", spkg); 
      if (this.cfg.update) progInst.save();
      this.rpt.totProgInst++;
      
      return progInst.get("id");
      
};

// Create the executable
let createProgram = function(software, company) {
  
      let program = this.mgr.create(this.tbl.prog);
      program.set("file_name", software.file_name);
      program.set("file_version", software.file_version);
      program.set("file_size", "9999999");
      program.set("original_name", software.file_name);
      program.set("program_common_name", software.spkg);
      program.set("product_name", software.spkg);      
      program.set("friendly_name", software.spkg);
      program.set("description", "Created by Data Simulator");
      program.set("system_component", false);
      program.set("publisher", company);
      if (this.cfg.update) program.save();
      this.rpt.totProgs++;
      
      return program.get("id");
      
};

// Find or create package
let getOrCreateSpkg = function(installedOn, company, software) {
  
      let spkgName = software.spkg;
      let spkgVer = software.spkg_version;
      
      let crit = new java.util.ArrayList();  
      crit.add(EQ("friendly_name", spkgName));
      crit.add(EQ("version", spkgVer));
      crit.add(EQ("installed_on", installedOn));
      crit.add(EQ("operational", true));

      let q = Query.select(java.util.Arrays.asList(Query.column("spkg.id", "id")));  
      q.from(this.tbl.spkg, "spkg");
      q.where(AND(crit));
      q.limit(1);
      q.orderBy("spkg.created_on", Order.DESC);
      let spkg = this.exec.execute1(q);  

      if (!spkg) {
            let newSpkg = this.mgr.create(this.tbl.spkg);
            newSpkg.set("name", spkgName);
            newSpkg.set("friendly_name", spkgName);
            newSpkg.set("version", spkgVer);    
            newSpkg.set("installed_on", installedOn);
            newSpkg.set("publisher", company);
            newSpkg.set("operational", true);
            newSpkg.set("os", false);
            newSpkg.set("created_on", new java.util.Date("1/1/2023"));
            if (this.cfg.update) newSpkg.save();
            this.rpt.totSpkgs++;
            spkg = newSpkg.get("id");
      } 

      return spkg;
      
};

// Return publisher/company id
let getOrCreateCompany = function(companyName) {
  
      let q = Query.select(java.util.Arrays.asList(Query.column("dc.id", "id")));  
      q.from(this.tbl.cmpny, "dc");
      q.where(EQ("name", companyName));
      q.limit(1);
      q.orderBy("dc.created_on", Order.DESC);
      let company = this.exec.execute1(q);

      if (!company) {
            let newCompany = this.mgr.create(this.tbl.cmpny);
            newCompany.set("name", companyName);
            if (cfg.update) newCompany.save();
            company = newCompany.get("id");
      }

      return company;
      
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
  
	let result = String.format("Crash records created: {0}, failed: {1}, last error: {2}, update flag: {3}, debug: {4}", 
		this.rpt.totCrashes,
		this.rpt.totCrashErr,
		this.rpt.err,
		this.cfg.update,
		this.cfg.debug);

	jobState.onProgress(100.0, result);			
};