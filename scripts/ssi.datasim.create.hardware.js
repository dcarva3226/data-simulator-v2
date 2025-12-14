/*============================================================================================================
 @Include: */ include("ssi.utils.js"); /*
 @Script: ssi.datasim.create.hardware.js
 @Author: Danny Carvajal
 @Version: 1.0.0 
 @Date: 1/15/2025

 Indian machines will have 250 GB space. The rest will be a mix of 500 and 999 GB.
=============================================================================================================*/

const DISKSIZE = [250.0, 500.0, 999.0];
const MACINFO = ["", "disk3s1s1", "/"];
const WININFO = ["C:", "C:", "Local Fixed Disk"];

const cfg = {
    logicalDisks    : true,
    debug           : "None",
    msgCancel	    : "The script has been manually cancelled...",
    update	        : true	
};

const rpt = {
    err             : "None",
    totComp         : 0,
    totMacs         : 0,
    totDisks        : 0
};

let run = function() {

    const fileSystemNTFS = this.getField("cmdb_file_system", "id", "name", "NTFS");
    if (!fileSystemNTFS) throw "File system NTFS not found...";   

    const fileSystemAPFS = this.getField("cmdb_file_system", "id", "name", "APFS");
    if (!fileSystemAPFS) throw "File system APFS not found...";   

    const driveType = this.getField("cmdb_drive_type", "id", "name", "local disk");
    if (!driveType) throw "Drive type not found...";

    const macOS = this.getField("cmdb_os", "id", "name", "macOS");
    if (!macOS) throw "macOS not found...";

    const location = this.getField("acu_group_type", "id", "name", "Location");
    if (!location) throw "Location was not found...";

    let cols = new java.util.ArrayList();
    cols.add(Query.column("c.id", "id"));
    cols.add(Query.column("c.os", "os"));   

    jobState.onProgress(1.0, "Running query to read computers...");		
    let q = Query.select(cols);
    q.from("cmdb_ci_computer", "c");
    let computers = this.exec.executeLM(q);
    rpt.totComp = computers.length;

    for (let i = 0; i < rpt.totComp; i++) {
                    
        if (jobHandle.isStopped()) throw cfg.msgCancel;        
        let computer = computers[i];
        let installedOn = computer["id"];
        let os = computer["os"];
        let isMac = (os == macOS) ? true : false;
 
        // Is this a MAC?
        let diskName = (!isMac) ? WININFO[0] : MACINFO[0];
        let deviceId = (!isMac) ? WININFO[1] : MACINFO[1];
        let fileSystem = (!isMac) ? fileSystemNTFS : fileSystemAPFS;
        let description = (!isMac) ? WININFO[2] : MACINFO[2];

        if (cfg.logicalDisks) {

            let diskCrits = new java.util.ArrayList();   
            diskCrits.add(EQ("installed_on", installedOn));
            diskCrits.add(EQ("name", "C:"));   

            let disk = this.mgr.readEntity("cmdb_ci_logical_disk", AND(diskCrits));
            if (!disk) {

                isIndia = isMachineInIndia(location, installedOn);
                let diskSpace = this.DISKSIZE[(isIndia) ? 0 : this.rand(1,2,0)];           
                let freeSpace = this.rand(100, diskSpace-100);

                disk = this.mgr.create("cmdb_ci_logical_disk");
                disk.set("installed_on", installedOn);
                disk.set("name", diskName);
                disk.set("device_id", deviceId);
                disk.set("drive_type", driveType);
                disk.set("file_system", fileSystem);
                disk.set("description", description);
                disk.set("encrypted", true);
                disk.set("disk_space", parseFloat(diskSpace));
                disk.set("free_space", parseFloat(freeSpace));      
                if (cfg.update) disk.save();   
                rpt.totDisks++;       
            }
        }

        jobState.onProgress(1.0, "Processing computer record #" + i);
    }
};


let isMachineInIndia = function(location, installedOn) {

    let q = Query.select("u.id");
    q.from("cmdb_ci_computer", "c");
    q.join("cmn_user", "u", "u.id", "c.primary_user");
    q.join("cmn_person", "p", "p.id", "u.person");
    q.join("acu_group_person", "agp", "agp.person", "p.id");
    q.join("acu_group", "ag", "ag.id", "agp.group");
    q.where(AND(EQ("c.id", installedOn), EQ("ag.type", location), EQ("ag.name", "India")));
    q.limit(1);

    let count = this.exec.execute1(q);    
    return (count > 0) ? true : false;
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
  
	let result = String.format("Computers processed: {0}, disks created: {1}, last error: {2}, update flag = {3}, debug={4}", 
		rpt.totComp,
		rpt.totDisks,
		rpt.err,
		cfg.update,
		cfg.debug);

	jobState.onProgress(100.0, result);			
};