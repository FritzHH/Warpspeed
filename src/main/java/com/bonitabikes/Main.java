package com.bonitabikes;

import java.util.Date;

/**
 * Main class for the Bonita Bikes application
 * This is a simple Java application that can be packaged as a JAR
 */
public class Main {
    
    public static void main(String[] args) {
        System.out.println("Welcome to Bonita Bikes!");
        System.out.println("Application started at: " + new Date());
        
        if (args.length > 0) {
            System.out.println("Arguments received:");
            for (int i = 0; i < args.length; i++) {
                System.out.println("  " + (i + 1) + ": " + args[i]);
            }
        } else {
            System.out.println("No arguments provided.");
        }
        
        System.out.println("Application completed successfully.");
    }
    
    /**
     * A simple utility method to get application version
     * @return the application version
     */
    public static String getVersion() {
        return "1.0.0";
    }
    
    /**
     * A simple utility method to get application name
     * @return the application name
     */
    public static String getApplicationName() {
        return "Bonita Bikes Hub FX";
    }
}
