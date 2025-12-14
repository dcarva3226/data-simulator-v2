/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.create.resources.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 3/27/2024
=============================================================================================================*/

let cfg = {
	debug       : "None",
	source      : "@datasim",
	update      : true,
      vdimanuf    : "VMware, Inc."
};

let rpt = {	
	err         : "None", 
	logName     : "Create Resources",
	params      : "",
	totUsers    : 0,
	totComp     : 0,
	totCompErr  : 0
};

let tbl = {
	cfg         : "ds_create_res_config",
	comp        : "cmdb_ci_computer",
	cmpny       : "cmdb_discovered_company",
	cpu         : "cmdb_cpu",
	dom         : "cmdb_domain",
	log         : "ds_create_res_log",
	osv         : "cmdb_os_version",
	sp          : "cmdb_software_product",
	user        : "cmn_user",
	userdb      : "ds_create_res_user_db"
};

let run = function() {

	let cancelMsg = "Script job was cancelled..."
	let objCfg = loadCfg();
	
	// -----------------------------------------------------
	// Create users
	// -----------------------------------------------------
      
      let numUsers = objCfg.number_of_users;

	if (this.getTableCount(this.tbl.userdb) < numUsers) 
		throw "The user count in the database is less than " + numUsers + ".";
	
	let fakeUsers = getFakeUsers(numUsers);

	for (let i = 0; i < fakeUsers.length; i++) {
		
		if (jobHandle.isStopped()) throw cancelMsg;
		
		let faker = fakeUsers[i];
			
		createUser(faker["email"],
			faker["first_name"],
			faker["last_name"],
			faker["phone"]);

		this.setJobProgress(10,
                  this.rpt.totUsers,
			numUsers*2,
			"users",
			"");
	}
	      
	// -----------------------------------------------------	
	// Create computers
	// -----------------------------------------------------	
      
      jobState.onProgress(50.0, "Creating computers..."); 	
      
      let numComps = objCfg.number_of_computers;
	let compNamePfx = objCfg.comp_name_prefix;
	let compVdiNamePfx = objCfg.comp_vdi_name_prefix;
	let vdiPercOfComp = objCfg.vdi_percentage;
	
	let fakePrimaryUsers = getPrimaryUsers(numComps);
	
	if (fakePrimaryUsers.length < numComps) {
		throw "Not enough fake users in the user table. Create more users.";
	}

	// A certain percentage of machines 
	let biosRelDate   = objCfg.bios_release_date_recent;
	let biosRelOldCnt = Math.round(numComps * (objCfg.bios_release_date_old_perc * .01));
      let nameCnt = 0;

	for (let i = 0; i < numComps; i++) {
		
            if (jobHandle.isStopped()) throw cancelMsg;
		
            let name = null;
            let isValidName = false;
            
            let rnd = rand(1, 100, 0);           
            let isVdi = (rnd <= vdiPercOfComp) ? true : false;
		
            // Give the new computer a name that doesn't already exist
            while (!isValidName) {
                  
                  if (jobHandle.isStopped()) throw cancelMsg;
                  
                  name = String.format("{0}00{1}", 
                        (isVdi) ? compVdiNamePfx : compNamePfx,
                        nameCnt);
		
                  let compExists = this.mgr.readEntity(this.tbl.comp, 
                        EQ("name", name));

                  if (compExists) {
                        nameCnt += 100;
                  } else {  
                        isValidName = true;
                        nameCnt++;
                  }
            }            

            if (biosRelOldCnt != 0) {
                  biosRelOldCnt--;
                  biosRelDate = objCfg.bios_release_date_older;
            } else {
                  biosRelDate = objCfg.bios_release_date_recent;
            }

            createComputer(name,
                  fakePrimaryUsers[i],
                  objCfg,
                  isVdi,
                  biosRelDate);
		
            // Progress starts 50% up because users are done
            if ((this.rpt.totComp % numComps) ==  0) {
                  jobState.onProgress(50.0 + (((this.rpt.totComp / numComps) * 100.0) - 50), 
                        String.format("Creating computer {0} of {1}...",                  
                              this.rpt.totComp,
                              numComps));
            }
	}	
};

/* ----------------------------------------------------------------------------------------------------------------
 FUNCTIONS
---------------------------------------------------------------------------------------------------------------- */ 

// Get the configuration parameters
let loadCfg = function() {
	
	let objConfig = {
            number_of_users : 0,
            number_of_computers : null,
            vdi_percentage : 0,
            operating_systems : [],
            comp_manuf : null,
            comp_model : null,
            comp_name_prefix : null,
            comp_vdi_name_prefix: null,
            comp_ip_address_prefix : null,
            comp_cpu : null,
            domain : null,bios_release_date_recent : null,
            bios_release_date_older : null,
            bios_release_date_old_perc : 0
            
	};
	
	let configs = this.mgr.readAllLazily(this.tbl.cfg);
	
	while (configs.hasNext()) 
	{							
		let val = null;
		let config = configs.next();
		let varName = config.get("var_name");
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

// Return fake users that have not been put in cmn_user
let getFakeUsers = function(limit) {
  
      let q1 = Query.select(java.util.Arrays.asList(Query.column("u.email", "id")));
      q1.from(this.tbl.user, "u");
      q1.where(ILIKE("u.source", "%" + this.cfg.source + "%"));
      let existingUsers = this.exec.executeL1(q1);
      
      let cols = new java.util.ArrayList();
      cols.add(Query.column("ud.email", "email"));
      cols.add(Query.column("ud.first_name", "first_name"));
      cols.add(Query.column("ud.last_name", "last_name"));
      cols.add(Query.column("ud.phone", "phone"));
      
      let q2 = Query.select(cols);
      q2.from(this.tbl.userdb, "ud");
      q2.where(NOT_IN("ud.email", existingUsers));
      q2.limit(limit);
      return this.exec.executeLM(q2);
};   

// Return some fake users to be used as primary users, but make sure they
// are not currenlty being used as a primary user.
let getPrimaryUsers = function(limit) {
      
      let q = Query.selectDistinct(java.util.Arrays.asList(Query.column("u.id", "id")));
      q.from(this.tbl.user, "u");
      q.join(this.tbl.comp, "c", "c.primary_user", "u.id");
      q.where(ILIKE("u.source", "%" + this.cfg.source + "%"));
      let existingUsers = this.exec.executeL1(q);

      let q2 = Query.select(java.util.Arrays.asList(Query.column("u.id", "id")));
      q2.from(this.tbl.user, "u");
      q2.where(AND(ILIKE("u.source", "%" + this.cfg.source + "%"), NOT_IN("u.id", existingUsers)));
      q2.limit(limit);
      return this.exec.executeL1(q2);

};

let createUser = function(email, first, last, phone) {
	
	let user = this.mgr.create(this.tbl.user);
	user.set("email",          email);
	user.set("first_name",     first);
	user.set("last_name",      last);
	user.set("name",           first + " " + last);
	user.set("phone",          phone);
	user.set("source",         String.format("{0}.{1}{2}", first, last, this.cfg.source));
	user.set("user_name",      email);
    user.set("created_on",     new java.util.Date("1/1/2020")); // any old date
	if (this.cfg.update) user.save();
	this.rpt.totUsers++;	

};

let createComputer = function(name, user, objCfg, isVdi, biosRelDate) {
	
	let mem = [33792, 66560];
	let ram = [16600, 33792];
	let hdd = [4053932, 350000, 1080000, 715402, 106486];
	
	let osVersion = getOSVersion(objCfg.operating_systems);
    let serial = getSerialNumber(isVdi);
    let vdimanuf = getOrCreateCompany(this.cfg.vdimanuf);
	let formFactor = getFormFactor(isVdi, objCfg.comp_model);
	let cpuSpeed = getSpeed(objCfg.comp_model);

	let computer = this.mgr.create(this.tbl.comp);
	computer.set("bios_date",                 biosRelDate);
	computer.set("cpu",                       getOrCreateCpu(objCfg.comp_cpu));
	computer.set("cpu_count",                 1);
	computer.set("cpu_speed",                 cpuSpeed);
	computer.set("ip_address",                getIPAddress(objCfg.comp_ip_address_prefix));
	computer.set("name",                      name);
    computer.set("bios_manufacturer",         (isVdi) ? vdimanuf : null);
    computer.set("bios_version",              (isVdi) ? "VMW71.00V.18452719.B64.2108091906" : null); 
	computer.set("form_factor", 			  formFactor);
	computer.set("manufacturer",              (isVdi) ? vdimanuf : getOrCreateCompany(objCfg.comp_manuf));
	computer.set("model_name",                (isVdi) ? "VMware Virtual Platform" : objCfg.comp_model);
	computer.set("owner",                     user);
	computer.set("os",                        getField(this.tbl.osv, "product", "id", osVersion));
	computer.set("os_ver",                    osVersion);
	computer.set("primary_user",              user);
	computer.set("virtual",                   (isVdi) ? true : false);		
	computer.set("memory_total_capacity",     mem[Math.floor(Math.random() * 2)]);
	computer.set("hd",                        hdd[Math.floor(Math.random() * 4)]);
	computer.set("ram",                       ram[Math.floor(Math.random() * 2)]);
	computer.set("domain",                    getOrCreateDomain(objCfg.domain));
	computer.set("dns_fullname",              name.toLowerCase() + "." + objCfg.domain.toLowerCase() + ".com"); 
	computer.set("description",               "Created by Data Simulator"); 
	computer.set("serial_number",             serial);
    computer.set("system_serial_no",          serial);
	computer.set("asset_tag",                 Math.random().toString(36).substr(2, 8).toUpperCase());
    computer.set("created_on",                new java.util.Date("1/1/2020")); // any old date      
	if (this.cfg.update) computer.save();
	this.rpt.totComp++;	

};

// Get CPU speed
let getSpeed = function(model) {
	
	let speeds = [2600, 2700, 3200, 4800];
	let speed = null;
	if (model == "Macbook Air") {
		speed = "3200";
	} else {
		speed = speeds[this.rand(0, 3, 0)];
	}

	return speed;
};

// Get form factor
let getFormFactor = function(isVdi, model) {
	
	let ff = null, type = "";
	if (isVdi) {
		type = "Virtual";
	} else if (model == "Optiplex 720 Plus") {
		type = "Desktop";
	} else if (model == "Latitude E6420") {
		type = "Laptop";
	} else if (model == "MacBook Air") {
		type = "Laptop";
	}

	return getField("cmdb_computer_form_factor", "id", "name", type);
};

// Create an IP from a string
let getIPAddress = function(prefix) {
	
	let ip = String.format("{0}.{1}.{2}", 
		prefix,
		Math.floor((Math.random() * 253) + 1),
		Math.floor((Math.random() * 253) + 1));
            
	return this.ip2int(ip);

};

// If a VDI, return a VMWare-style serial number
let getSerialNumber = function(isVdi) {
      
      let serial = null;
      
      if (!isVdi) {
            serial = Math.random().toString(36).substr(2, 8).toUpperCase()
      } else {
            serial = String.format("VMware-56 4d 31 24 3b bc 5c 92-63 e1 ae c1 {0} {1} {2} {3}",
                  rand(10, 99, 0),
                  rand(10, 99, 0),
                  rand(10, 99, 0),
                  rand(10, 99, 0));
      }
      
      return serial;

};

// Get random OSV from osList array
let getOSVersion = function(osvList) {
	
	let osVer = null;
	let rnd = Math.floor(Math.random() * osvList.length);
	let osv = osvList[rnd].trim();
	
	let entity = this.mgr.readEntity(this.tbl.osv, 
	EQ("friendly_name", osv));	
	
	if (!entity) {
            throw "The os version was not found: '" + osv + "'.";
	} else {
		osVer = entity.get("id");
	}
        
	return osVer;
	
};

// Get the domain or create it
let getOrCreateDomain = function(name) {
		
	let domainId = null;
	let domain = this.mgr.readEntity(this.tbl.dom, EQ("name", name));
	if (domain) {
		domainId = domain.get("id");
	} else {
		domain = this.mgr.create(this.tbl.dom);
		domain.set("name", name);
		if (this.cfg.update) domain.save();
		domainId = domain.get("id");
	}
	
	return domainId;
      
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

let getOrCreateCpu = function(cpuName) {
  
      let q = Query.select(java.util.Arrays.asList(Query.column("c.id", "id")));  
      q.from(this.tbl.cpu, "c");
      q.where(EQ("model", cpuName));
      q.limit(1);
      q.orderBy("c.created_on", Order.DESC);
      let cpu = this.exec.execute1(q);

      if (!cpu) {
            let newCpu = this.mgr.create(this.tbl.cpu);
            newCpu.set("model", cpuName);
            if (cfg.update) newCpu.save();
            cpu = newCpu.get("id");
      }

      return cpu;

};  

// Write results to log
let logDetails = function() {
	
	let log = this.mgr.create(this.tbl.log);
	log.set("name", this.rpt.logName);
	log.set("users_created", this.rpt.totUsers);
	log.set("comp_created", this.rpt.totComp);
	log.set("parameter_list", this.rpt.params);
	log.set("err", this.rpt.err.substring(0, 254));
	log.save();
	
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
  
	let result = String.format("Users: {0}, computers: {1}, last error: {2}, update flag: {3}, debug: {4}", 
		this.rpt.totUsers,
		this.rpt.totComp,
		this.rpt.err,
		this.cfg.update,
		this.cfg.debug);

	jobState.onProgress(100.0, result);			
};