import module java.net.http;

import java.net.URI;
import static java.net.http.HttpResponse.BodyHandlers;
import static java.net.http.HttpRequest.BodyPublishers;

class LoadTestUtility {
	private static final String BASE_URL = "http://localhost:8080/";
	private static final String VISIT_RESOURCE_URL = "owners/%d/pets/%d/visits/new";

	public void main(String[] args) {
		HttpClient client = HttpClient.newHttpClient();
		String requestType = args[0];

		switch (requestType) {
			case "VETS" -> {
				System.out.println("Sending 100,000 requests to: " + BASE_URL + "vets");
				HttpRequest request = HttpRequest.newBuilder().uri(URI.create(BASE_URL + "vets")).build();
				for (int i = 0; i < 100_000; i++) {
					client.sendAsync(request, BodyHandlers.ofString()).thenApply(HttpResponse::headers)
							.thenAccept(t -> {}).join();
					if(i % 1000 == 0) {
						System.out.print(i/1000 + "% complete");
						System.out.print("\r");
					}
					
				}
				System.out.println("100,000 requests successfully sent!");
			}
			case "VISITS" -> {
				System.out.println("Creating 200 new visit records");
				for (int i = 1; i < 200; i++) {
					int id = (i % 10) + 1;
					String resource = String.format(VISIT_RESOURCE_URL, id, id);
					String postBody = String.format("date=2026-03-19&description=Check-up&petId=%d", id);
					HttpRequest request = HttpRequest.newBuilder().uri(URI.create(BASE_URL + resource))
							.header("Content-Type", "application/x-www-form-urlencoded")
							.POST(BodyPublishers.ofString(postBody)).build();
	
					client.sendAsync(request, BodyHandlers.ofString()).thenApply(HttpResponse::headers)
							.thenAccept(t -> {}).join();
					if(i % 2 == 0) {
						System.out.print(i/2 + "% complete");
						System.out.print("\r");
					}
				}
				System.out.println("200 new visit records successfully created!");
			}
		}

	}
}