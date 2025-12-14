/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.create.apps.no.usage.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 3/27/2024
 @Notes: see individual functions below for more details. Run this with the Data Simulator, but this will
 just leave out the usage records.
=============================================================================================================*/

let cfg = {
      debug             : "None",
      source            : "@datasim",
      update            : true
};

let rpt = {	
      err               : "None",
      params            : "",
      totProgs          : 0,
      totProgInst       : 0,
      totRecsSoftware   : 0,
      totRecsWebApp     : 0,
      totSpkgs          : 0,
      totUtils          : 0
};

let tbl = {
      acu_gp            : "acu_group_person",
      acu_grp           : "acu_group",
      acu_gt            : "acu_group_type",
      cfg               : "ds_daily_usage_config",
      cmpny             : "cmdb_discovered_company",
      comp              : "cmdb_ci_computer",
      dev_res_util      : "cmdb_device_resource_util",
      du                : "cmdb_program_daily_usage",
      exc_usrs          : "ds_daily_usage_users_exclude",
      inc_grps          : "ds_daily_usage_groups_include",
      inc_usrs          : "ds_daily_usage_users_include",
      log               : "ds_daily_usage_log",
      person            : "cmn_person",
      prog              : "cmdb_program",
      prog_inst         : "cmdb_program_instance", 
      soft              : "ds_daily_usage_software",
      spkg              : "cmdb_ci_spkg",
      usage_plans       : "ds_daily_usage_plan",      
      user              : "cmn_user",
      wdu               : "cmdb_webapp_daily_usage",
      web               : "ds_daily_usage_webapp",
};

let run = function() {

      let objCfg        = loadCfg();

      if (!objCfg.create_pdu && !objCfg.create_hw) {
            this.rpt.err = "There is no work to be done.";
            return true;
      }
            
      let desktopApps   = getDesktopAppConfig();
      let webApps       = getWebAppConfig();      
      let incGroups     = getConfigData(this.tbl.inc_grps, "group");
      let incUsrs       = getConfigData(this.tbl.inc_usrs, "user");
      let excUsrs       = getConfigData(this.tbl.exc_usrs, "user");      
      
      let applications  = [desktopApps, webApps];
      
      // Create usage for desktop and web apps
      for (let n = 0; n < applications.length; n++) {
            
            let apps = applications[n];
            
            // Loop through each software title
            for (let i = 0; i < apps.length; i++) {
                  
                  let app           = apps[i];
                  let users         = getUsers(app, incGroups, incUsrs, excUsrs);               
                  let usrLen        = users.length;
                                        
                  // Loop through each user
                  for (let x = 0; x < usrLen; x++) {
                  
                        if (jobHandle.isStopped()) throw "Manual script cancellation...";            
                        
                        let user = users[x];
                        let installedOn = this.getComputer(user);
                        if (!installedOn) throw "Could not find computer for user " + user + ".";
                        
                        // Create daily usage flag is true?
                        programInstance = getOrCreateProgramInstance(installedOn, app);
                        this.rpt.totRecsSoftware++;                                    
                  }
            }            
            
      }
      
      this.rpt.params += String.format("desktop apps: {0}, web apps: {1}", 
            desktopApps.length, 
            webApps.length);      
};

/* ----------------------------------------------------------------------------------------------------------------
 FUNCTIONS
---------------------------------------------------------------------------------------------------------------- */ 

let loadCfg = function() {
	
	let objConfig = {
            create_pdu : true,
            create_hw : true,
            start_date : null,
            end_date : null,
            lup : 0,
            mup : 0,
            hup : 0,
            nup : 0,
            plan_1 : 0,
            plan_2 : 0,
            plan_2_flat : 0,
            plan_3 : 0,
            plan_4 : 0,             
            lu_min_mins : 0,
            lu_max_mins : 0,
            mu_min_mins : 0,
            mu_max_mins : 0,
            hu_min_mins : 0,
            hu_max_mins : 0,
            lu_min_keys : 0,
            lu_max_keys : 0,
            mu_min_keys : 0,
            mu_max_keys : 0,
            hu_min_keys : 0,
            hu_max_keys : 0,
            lu_min_mous : 0,
            lu_max_mous : 0,
            mu_min_mous : 0,
            mu_max_mous : 0,
            hu_min_mous : 0,
            hu_max_mous : 0,                    
            exclude_weekends : true,
            min_times_started : 0,
            max_times_started : 0,
            start_hour : 0,
            end_hour : 0,
            hw_cpu_min : 0,
            hw_cpu_max : 0,
            hw_mem_min : 0,
            hw_mem_max : 0
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

// Return one or more software config records
let getDesktopAppConfig = function() {
      
      let cols = new java.util.ArrayList();
      cols.add(Query.column("s.publisher", "publisher"));
      cols.add(Query.column("s.spkg", "spkg"));
      cols.add(Query.column("s.spkg_version", "spkg_version"));
      cols.add(Query.column("s.department", "department"));
      cols.add(Query.column("s.location", "location"));
      cols.add(Query.column("s.role", "role"));
      cols.add(Query.column("s.team", "team"));
      cols.add(Query.column("s.file_name", "file_name"));      
      cols.add(Query.column("s.file_path", "file_path"));      
      cols.add(Query.column("s.file_version", "file_version"));       

      let q = Query.select(cols);
      q.from(this.tbl.soft, "s");
      q.where(EQ("s.enabled", true));
      q.orderBy("s.created_on", Order.ASC);
      let soft = this.exec.executeLM(q);
      
      return soft;
      
};

// Return one or more webapp config records
let getWebAppConfig = function() {
      
      let cols = new java.util.ArrayList();
      cols.add(Query.column("w.webapp", "webapp"));
      cols.add(Query.column("w.department", "department"));
      cols.add(Query.column("w.location", "location"));
      cols.add(Query.column("w.role", "role"));
      cols.add(Query.column("w.team", "team"));

      let q = Query.select(cols);
      q.from(this.tbl.web, "w");
      q.where(EQ("w.enabled", true));
      q.orderBy("w.created_on", Order.ASC);
      let webapps = this.exec.executeLM(q);
      
      return webapps;
      
};

// Work out unique users from included groups, included/excluded users
let getUsers = function(software, incGroups, incUsrs, excUsrs) {
            
      // Look for any software group filters from the "Select Software" menu
      let dept          = getGroup("department", software.department);
      let loc           = getGroup("location", software.location);
      let team          = getGroup("team", software.team);
      let role          = getGroup("role", software.role);

      // Match software group filters
      let groupCrit = new java.util.ArrayList();
      if (dept) groupCrit.add(EQ("gp.group", dept));
      if (loc)  groupCrit.add(EQ("gp.group", loc));
      if (team) groupCrit.add(EQ("gp.group", team));
      if (role) groupCrit.add(EQ("gp.group", role));

      let groupFilteredUsers = null;
      if (dept || loc || team || role) {
            let fg = Query.selectDistinct(java.util.Arrays.asList(Query.column("u.id", "id")));
            fg.from(this.tbl.acu_gp, "gp");
            fg.join(this.tbl.person, "p", "p.id", "gp.person");
            fg.join(this.tbl.user, "u", "u.person", "p.id");
            fg.where(AND(groupCrit));
            groupFilteredUsers = this.exec.executeL1(fg);
      }

      // Get the users from included groups
      let qg = Query.selectDistinct(java.util.Arrays.asList(Query.column("u.id", "id")));
      qg.from(this.tbl.acu_gp, "gp");
      qg.join(this.tbl.person, "p", "p.id", "gp.person");
      qg.join(this.tbl.user, "u", "u.person", "p.id");
      qg.where(IN("gp.group", incGroups));
      let groupUsers = this.exec.executeL1(qg);
      
      // Now do run a query with all criteria includedd
      let criterion = new java.util.ArrayList();
      criterion.add(OR(IN("u.id", incUsrs), IN("u.id", groupUsers)));
      criterion.add(NOT_IN("u.id", excUsrs));
      criterion.add(ILIKE("u.source", "%" + this.cfg.source + "%"));
      if (groupFilteredUsers) criterion.add(IN("u.id", groupFilteredUsers));
      
      let q = Query.selectDistinct(java.util.Arrays.asList(Query.column("u.id", "id")));
      q.from(this.tbl.user, "u");
      q.where(AND(criterion));

      return this.exec.executeL1(q);

};

// Return a computer's primary user
let getComputer = function(primaryUser) {
  
      let q = Query.select(java.util.Arrays.asList(Query.column("c.id", "id")));
      q.from(this.tbl.comp, "c");
      q.where(EQ("c.primary_user", primaryUser));
      q.limit(1);
      return this.exec.execute1(q);
      
};

let getConfigData = function(tbl, field) {

	let q = Query.select(java.util.Arrays.asList(Query.column("x." + field, field)));
	q.from(tbl, "x");
	return this.exec.executeL1(q);
      
};

// Get records from the acu_group table
let getGroup = function(type, name) {

      let crit = new java.util.ArrayList();
      crit.add(EQ("g.name", name));
      crit.add(ILIKE("t.name", type));

      let q = Query.select(java.util.Arrays.asList(Query.column("g.id", "id")));
      q.from(this.tbl.acu_grp, "g");
      q.join(this.tbl.acu_gt, "t", "t.id", "g.type");
      q.where(AND(crit));
      q.limit(1);
      return this.exec.execute1(q);
      
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
 UTILITIES
---------------------------------------------------------------------------------------------------------------- */ 


/* ----------------------------------------------------------------------------------------------------------------
 STARTING POINT
---------------------------------------------------------------------------------------------------------------- */ 
try {
  
      run();
  
} catch (e) {
  
	this.rpt.err = e;
  
} finally {
      
	let result = String.format("Software recs created: {0}, Web app recs created: {1}, HW Util records: {2}, last error: {3}, update flag = {4}, debug={5}", 
		this.rpt.totRecsSoftware,
            this.rpt.totRecsWebApp,
            this.rpt.totUtils,
		this.rpt.err,
		this.cfg.update,
		this.cfg.debug);

	jobState.onProgress(100.0, result);			
};