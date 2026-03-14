# Create and Record Custom JFR Events 

As of JDK 25 JFR comes with 197 built-in events, with more events being added with every release of the JDK. These built-in events cover a wide variety of behavior: starting and stopping of threads, garbage collection actions, file I/O, and more! While these built-in events provide a lot of value and insight into the behavior of the JVM, JDK, and your application, the information they provide might be either incomplete or lacking context. This is where user-defined or "custom" JFR events can help fill in these gaps.  

In this module we will step through the process of creating an event, adding it to your application, configuring the event, and analyzing it. 

## **Lab Activity 1**: Create and Register a Custom Event

1. Creating a custom JFR event at the most basic level is very simple, simply extend the `jdk.jfr.Event` class. Let's begin the process of creating our custom JFR event, `NewVisit` in the `org.springframework.samples.petclinic.owner` package:

```java
import jdk.jfr.Event; 

public class NewVisit extends Event {
	
}
```

2. An `Event` without fields is of little use. The fields of an `Event` can be any of the eight primitive types; `boolean`, `byte`, `char`, `double`, `float`, `int`, `long`, `short`, or `String`. Attempting to use any other type for a field will be silently ignored by JFR. Let's add four fields to `NewVisit` for capturing contextual information about an owner scheduling a visit for their pet, we will also want a "setter" method for each field:

```java
import jdk.jfr.Event; 
import jdk.jfr.Label; 
import jdk.jfr.Name;
	
public class NewVisit extends Event {

	private String visitDate;
	private String visitDescription;
	private int ownerId;
	private int petId;
	
	public NewVisit() {
	}
	public void setVisitDate(String visitDate) {
		this.visitDate = visitDate;
	}
	public void setVisitDescription(String visitDescription) {
		this.visitDescription = visitDescription;
	}
	public void setOwnerId(int ownerId) {
		this.ownerId = ownerId;
	}
	public void setPetId(int petId) {
		this.petId = petId;
	}
}
```

3. JFR provides a number of annotations, they can be useful for providing important metadata and contextual info about your event, as well serving some functional purposes, which we will get to later in this module. At the class level we will add `@Name` and `@Category`. For name, if we don't add one JFR will use the full class name. This can be fine, but the general recommendation is to use org name (in this case we will use `javaOne`), and the class name of the `Event`, this matches the built-in events which are all prefixed with `jdk`. Categories can be useful for filtering events, lets provide two categories for `NewVisit`: `PII` and `Performance`. We will also use `@Label`, this can provide some useful metadata about a field, like for example stating the date format of the `visitDate`. Here is what the updated class should look like:

```java
@Name("javaOne.NewVisit")
@Category({"PII", "Performance"})
public class NewVisit extends Event {

	@Label("Date of vet visit: yyyy-mm-dd")
	private String visitDate;
	private String visitDescription;
	private int ownerId;
	private int petId;
	
	public NewVisit() {
	}
	public void setVisitDate(String visitDate) {
		this.visitDate = visitDate;
	}
	public void setVisitDescription(String visitDescription) {
		this.visitDescription = visitDescription;
	}
	public void setOwnerId(int ownerId) {
		this.ownerId = ownerId;
	}
	public void setPetId(int petId) {
		this.petId = petId;
	}
}
```

4. Next we need to add this event to our application. Open the class `org.springframework.samples.petclinic.owner.VisitController` and go to the `processNewVisitForm()` method. 
5. We will need to create a new instance of our `NewVisit` at the start of the method, and call `begin()` on it. This starts the timer for the event for how long it takes this method to execute. 

```java
public String processNewVisitForm(@ModelAttribute Owner owner, @PathVariable int petId, @Valid Visit visit,
		BindingResult result, RedirectAttributes redirectAttributes) {
	NewVisit newVisit = new NewVisit();
	newVisit.begin();
```

6. Before the `return` add a line and call `newVisit.end()` on the event this will stop the timer.

```java
	newVisit.end();
	return "redirect:/owners/{ownerId}";
```

7. Now we need to populate the event fields:

```java
	newVisit.setOwnerId(owner.getId());
	newVisit.setPetId(petId);
	newVisit.setVisitDate(visit.getDate().toString());
	newVisit.setVisitDescription(visit.getDescription());
```

8. Last, and very important, we need to call `commit()`, which, as the name suggests will commit the JFR event to be included in the recording. The final code should look like this: 

```java
@PostMapping("/owners/{ownerId}/pets/{petId}/visits/new")
public String processNewVisitForm(@ModelAttribute Owner owner, @PathVariable int petId, @Valid Visit visit,
		BindingResult result, RedirectAttributes redirectAttributes) {
	NewVisit newVisit = new NewVisit();
	newVisit.begin();
	if (result.hasErrors()) {
		return "pets/createOrUpdateVisitForm";
	}

	owner.addVisit(petId, visit);
	this.owners.save(owner);
	redirectAttributes.addFlashAttribute("message", "Your visit has been booked");
	newVisit.end();
	newVisit.setOwnerId(owner.getId());
	newVisit.setPetId(petId);
	newVisit.setVisitDate(visit.getDate().toString());
	newVisit.setVisitDescription(visit.getDescription());
	newVisit.commit();
	return "redirect:/owners/{ownerId}";
}
```

9. Recompile and package the application:

```
mvn clean package
```

> [!TIP] 
> While from a code perspective adding a JFR event is somewhat intrusive looking, the performance impact is typically very low. Most of the potential performance hit could come from the data being added to the event. Which if it might be significant, consider wrapping them in an `if` statement that is checking `isEnabled()` or `shouldCommit()` methods. 

## **Lab Activity 2**: Record a Custom Event

Now that we have added a custom event to the application, let's see what it looks like when JFR captures it!

> [!TIP] 
> Custom events are enabled by default, so no further steps are needed to start using it.  

1. Start up the petclinic app with JFR enabled:

```shell
$ java -XX:StartFlightRecording=dumponexit=true,filename=custom-event-recording.jfr -jar target/spring-petclinic-4.0.0-SNAPSHOT.jar
```

2. Run the load test that's located in the `lab-jfr/` directory using the `VISITS` option (this might take a few moments to complete):

```shell
$ java ../LoadTestUtility.java VISITS
```

3. Shutdown the application.
4. View all the executed events using `jfr summary`:

```shell
$ jfr summary custom-event-recording.jfr 
```

A bit further down in the output you should see the name of the custom event `javaOne.NewVisit`

```
 Event Type                              Count  Size (bytes) 
=============================================================
 jdk.ModuleExport                         1620         19304
 jdk.NativeMethodSample                   1231         13837
 jdk.NativeLibrary                         848         74474
 jdk.SystemProcess                         832         86202
 jdk.ActiveSetting                         758         21252
 jdk.BooleanFlag                           481         15241
 jdk.GCPhaseParallel                       284          7213
 javaOne.NewVisit                          199          8520
 jdk.ModuleRequire                         163          1793
 jdk.ObjectAllocationSample                154          2445
 jdk.LongFlag                              138          4571
 jdk.ThreadPark                            128          4633
 jdk.Checkpoint                            126        349369
```

6. Let's get a more detailed view of the `NewVisit`s using the `jfr print` command:

```shell
$ jfr print --events javaOne.NewVisit custom-event-recording.jfr
```

And in the output, you can see details of the event:

```
javaOne.NewVisit {
  startTime = 13:44:07.837 (2026-03-10)
  duration = 22.0 ms
  visitDate = "2026-03-19"
  visitDescription = "Check-up"
  ownerId = 2
  petId = 2
  ownerFirstName = N/A
  ownerLastName = N/A
  eventThread = "tomcat-handler-0" (javaThreadId = 56, virtual)
  stackTrace = [
    org.springframework.samples.petclinic.owner.VisitController.processNewVisitForm(Owner, int, Visit, BindingResult, RedirectAttributes) line: 108
    jdk.internal.reflect.DirectMethodHandleAccessor.invoke(Object, Object[]) line: 104
    java.lang.reflect.Method.invoke(Object, Object[]) line: 565
    org.springframework.web.method.support.InvocableHandlerMethod.doInvoke(Object[]) line: 258
    org.springframework.web.method.support.InvocableHandlerMethod.invokeForRequest(NativeWebRequest, ModelAndViewContainer, Object[]) line: 190
  ]
}
```

If you look closely at the duration of the `NewVisit` instances you will notice some are much longer (>1s) than others (<25ms):

```
javaOne.NewVisit {
  startTime = 13:44:07.933 (2026-03-10)
  duration = 1.02 s
  visitDate = "2026-03-19"
  visitDescription = "Check-up"
  ownerId = 10
  petId = 10
  ownerFirstName = N/A
  ownerLastName = N/A
  eventThread = "tomcat-handler-8" (javaThreadId = 66, virtual)
  stackTrace = [
    org.springframework.samples.petclinic.owner.VisitController.processNewVisitForm(Owner, int, Visit, BindingResult, RedirectAttributes) line: 108
    jdk.internal.reflect.DirectMethodHandleAccessor.invoke(Object, Object[]) line: 104
    java.lang.reflect.Method.invoke(Object, Object[]) line: 565
    org.springframework.web.method.support.InvocableHandlerMethod.doInvoke(Object[]) line: 258
    org.springframework.web.method.support.InvocableHandlerMethod.invokeForRequest(NativeWebRequest, ModelAndViewContainer, Object[]) line: 190
  ]
}
```

In this case, it's because of a deliberate "bug" added to the code that artificially slows the execution of every tenth request. However, this brings up a useful feature of JFR, the ability configure _when_ an event is retained. Let's take a look at that in the next lab. 


## **Lab Activity 3**: Edit a Settings File to Include a Custom Event

Custom events, like the built-in events can be configured through a `.jfc` settings file. Through this file, along with very coarse-grained behavior like enable/disabling an event, you can also configure conditions for when an event should be captured. This can be a great way to reduce the amount of "noise" in a JFR file, retaining only the events you find interesting. 

1. Use the `jfr configure` tool to update the `custom.jfc` settings files from the first module (if you skipped the first module, simply omit the `--input` portion of the below command), and add a threshold of 1s to `NewVisit` so it's only captured if the execution time between the calls to `begin()` and `end()` took longer than 1 second:

```shell
jfr configure --input ../custom.jfc +javaOne.NewVisit#enabled=true  +javaOne.NewVisit#threshold=1s --output ../custom.jfc
``` 

2. Start the petclinic app again with JFR enabled and using the the `custom.jfc` settings:

```shell
$ java -XX:StartFlightRecording=settings=../custom.jfc,dumponexit=true,filename=custom-event-recording.jfr -jar target/spring-petclinic-4.0.0-SNAPSHOT.jar
```

3. Run the load test again:

```shell
$ java ../LoadTestUtility.java VISITS
```

4. Check `jfr summary` and confirm that only 20 instances of `javaOne.NewVisit` have been captured.

> [!TIP] 
> Another option for limiting how often an event is captured is using the `period` setting, which will only capture an emission of the event after the period timer has elapsed. Events can also be configured in a class using the `@Enabled`, `@Threshold`, and `@Period` annotations.  

Let's explore how we can filter that—and any other arbitrary data—out of our JFR recording in the next lab to allow safe sharing of JFR recordings.

## **Lab Activity 4**: Scrub Data out of a JFR Recording

The `NewVisit` with the `visitDate` and `visitDescription` fields contains some information that we might not want to share with people outside of our organization, luckily we can easily filter that, and any arbitrary data out of our JFR recording using the `jfr scrub` utility. 

1. View the options `jfr scrub` offers by running it without any options:

```shell
$ jfr scrub
 jfr scrub [--include-events <filter>]
           [--exclude-events <filter>]
           [--include-categories <filter>]
           [--exclude-categories <filter>]
           [--include-threads <filter>]
           [--exclude-threads <filter>]
           <input-file>
           [<output-file>]
...
```

2. When we created the `NewVisit` we used `@Category` and added "PII" (Personally Identifiable Information) to it, we can use that category to remove the `NewVisit` instances from a recording:

```shell 
$ jfr scrub --exclude-categories PII custom-event-recording.jfr scrubbed-recording.jfr
```

3. Confirm that all instances of `NewVisit` have been excluded from `scrubbed-recording.jfr` by running: `jfr summary`:

```shell
jfr summary scrubbed-recording.jfr
```

Next, we'll look at [consuming JFR events with the Events Stream API!](../D_consume_events/README.md)!

## Additional Information on Custom Events


Naming events:
* When the `@Name` is not used, JFR will default to using the fully qualified class name
* Because JFR will default to using the fully qualified class name, it's highly encouraged to use a name to prevent issues from refactoring and moving the code location of an Event. 
* Do not include "Event" in the name of an event.
* An event name should be short but with a meaning that it does not clash with other organizations or products.
* The name should be easy to understand for those who want to configure the event or interpret its meaning during profiling.
* Usually, it is sufficient to put all the events for an organization, library, or product in the same namespace:
	* All the events for OpenJDK are in the `jdk` namespace.
	* While `hotspot` , `gc` , or `compiler` are not namespaces, these keywords are present in categories (through the @Category annotation).

For labels, use headline-style capitalization:
* Capitalize the first and last words and all nouns, pronouns, adjectives, verbs and adverbs.
* Do not include ending punctuation.
* Omit the word `Event`.
* Do not use `@Label` as an identifier; use the `@Name` annotation instead.

Each event has the following predefined settings: 
    * `@Enabled` specifies whether the event is recorded. The default value is `true`. 
    * `@Threshold` indicates the duration below which an event is not recorded. The default is 0 (no limit). 
    * `@Period` specifies the interval at which the event is emitted, if it is periodic. The default value is `everyChunk` , which means that the periodic event will be emitted at least once in the recording. 
    * `@StackTrace` refers to whether the stack trace from the `Event::commit()` method is recorded. The default value is true .

To emit a JFR event programmatically, you can start timing of an event through `Event::begin` method and write the field values via `Event::commit` method.
The `commit` method ends the timing of an event without the need for an explicit call to the `end` method.

```java
var event = new org.example.HelloWorld();
event.message = message;
event.begin();
event.commit();
```


Note: Later modules will show consuming and testing custom events end-to-end. For this workshop we will continue using the `javaOne.NewVisit` event created above.